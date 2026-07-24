const DEFAULT_API_BASE = "https://eye-analysis.online/api/v1";

async function getConfig() {
  const { apiBase, token } = await chrome.storage.local.get(["apiBase", "token"]);
  return { apiBase: apiBase || DEFAULT_API_BASE, token: token || null };
}

async function apiFetch(path, options = {}) {
  const { apiBase, token } = await getConfig();
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.data?.message || body?.message || `Request failed (${res.status})`);
  }
  return body?.data ?? body;
}

async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data.two_factor) {
    return { twoFactor: true, challenge: data.challenge };
  }
  await chrome.storage.local.set({ token: data.token, user: data.user });
  return { twoFactor: false, user: data.user };
}

async function verifyTwoFactor(challenge, code) {
  const data = await apiFetch("/auth/two-factor/verify", {
    method: "POST",
    body: JSON.stringify({ challenge, code }),
  });
  await chrome.storage.local.set({ token: data.token, user: data.user });
  return data.user;
}

async function logout() {
  await chrome.storage.local.remove(["token", "user"]);
}

const COMPOSE_URL = {
  x: "https://x.com/compose/post",
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
};

// Tabs we opened for a scheduled post, waiting for them to finish loading so
// we can fill the compose box. Cleared once filled (or on tab close).
const pendingFills = new Map(); // tabId -> { postId, text }

async function checkDuePosts() {
  const { token } = await getConfig();
  if (!token) return;

  let due = [];
  try {
    due = await apiFetch("/scheduled-posts/due");
  } catch (err) {
    return; // not logged in / offline — try again next alarm tick
  }
  if (!due.length) return;

  const { notifiedPostIds = [] } = await chrome.storage.local.get(["notifiedPostIds"]);
  const alreadyNotified = new Set(notifiedPostIds);

  for (const post of due) {
    if (alreadyNotified.has(post.id)) continue;
    alreadyNotified.add(post.id);

    chrome.notifications.create(`eye-post-${post.id}`, {
      type: "basic",
      iconUrl: "https://eye-analysis.online/favicon.ico",
      title: `Scheduled post ready — ${post.platform}`,
      message: post.content.slice(0, 150),
      buttons: [{ title: "Open & fill" }],
      requireInteraction: true,
    });

    chrome.notifications.onButtonClicked.addListener(function listener(notifId) {
      if (notifId !== `eye-post-${post.id}`) return;
      chrome.notifications.onButtonClicked.removeListener(listener);
      openAndFill(post);
    });
  }

  await chrome.storage.local.set({ notifiedPostIds: Array.from(alreadyNotified) });
}

async function openAndFill(post) {
  const url = COMPOSE_URL[post.platform];
  const tab = await chrome.tabs.create({ url });
  pendingFills.set(tab.id, { postId: post.id, text: post.content });
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const pending = pendingFills.get(tabId);
  if (!pending) return;
  pendingFills.delete(tabId);

  // Give the platform's SPA a moment to render the compose box after "complete".
  setTimeout(async () => {
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        type: "EYE_FILL_REPLY_ON_PAGE",
        text: pending.text,
      });
      if (res?.ok) {
        await apiFetch(`/scheduled-posts/${pending.postId}/status`, {
          method: "POST",
          body: JSON.stringify({ status: "filled" }),
        });
      }
    } catch (err) {
      // Content script not ready / selector miss — user can still open the
      // popup and fill manually from the Compose tab.
    }
  }, 1500);
});

chrome.alarms.create("eye-check-due-posts", { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "eye-check-due-posts") checkDuePosts();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "EYE_LOGIN": {
          const result = await login(message.email, message.password);
          sendResponse({ ok: true, data: result });
          break;
        }
        case "EYE_VERIFY_2FA": {
          const user = await verifyTwoFactor(message.challenge, message.code);
          sendResponse({ ok: true, data: user });
          break;
        }
        case "EYE_LOGOUT": {
          await logout();
          sendResponse({ ok: true });
          break;
        }
        case "EYE_GET_INBOX": {
          const items = await apiFetch("/social/inbox");
          sendResponse({ ok: true, data: items });
          break;
        }
        case "EYE_SYNC_ITEMS": {
          // Pushed by a content script after scraping a page it's logged into.
          const result = await apiFetch("/social/inbox/sync", {
            method: "POST",
            body: JSON.stringify({ items: message.items }),
          });
          sendResponse({ ok: true, data: result });
          break;
        }
        case "EYE_DRAFT_REPLY": {
          const result = await apiFetch(`/social/inbox/${message.id}/draft`, { method: "POST" });
          sendResponse({ ok: true, data: result });
          break;
        }
        case "EYE_SET_STATUS": {
          const result = await apiFetch(`/social/inbox/${message.id}/status`, {
            method: "POST",
            body: JSON.stringify({ status: message.status }),
          });
          sendResponse({ ok: true, data: result });
          break;
        }
        case "EYE_FILL_REPLY": {
          // Relay to the matching open tab's content script; it fills the
          // native compose box. The user still has to click Send themselves.
          const tabs = await chrome.tabs.query({ url: message.urlPattern });
          if (!tabs.length) {
            sendResponse({ ok: false, error: "No matching tab is open for that platform." });
            break;
          }
          await chrome.tabs.sendMessage(tabs[0].id, {
            type: "EYE_FILL_REPLY_ON_PAGE",
            text: message.text,
          });
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err.message || err) });
    }
  })();
  return true; // keep the message channel open for the async response
});
