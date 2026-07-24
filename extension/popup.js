const loginView = document.getElementById("login-view");
const inboxView = document.getElementById("inbox-view");
const itemsEl = document.getElementById("items");
const emptyHint = document.getElementById("empty-hint");

const PLATFORM_URL_PATTERN = {
  facebook: "*://*.facebook.com/*",
  x: "*://x.com/*",
  instagram: "*://*.instagram.com/*",
};

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function init() {
  const { token } = await chrome.storage.local.get(["token"]);
  if (token) {
    loginView.hidden = true;
    inboxView.hidden = false;
    await loadInbox();
  } else {
    loginView.hidden = false;
    inboxView.hidden = true;
  }
}

document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";

  const res = await send({ type: "EYE_LOGIN", email, password });
  if (!res.ok) {
    errEl.textContent = res.error;
    return;
  }
  if (res.data.twoFactor) {
    document.getElementById("otp-row").hidden = false;
    document.getElementById("login-btn").dataset.challenge = res.data.challenge;
    return;
  }
  await init();
});

document.getElementById("otp-btn").addEventListener("click", async () => {
  const challenge = document.getElementById("login-btn").dataset.challenge;
  const code = document.getElementById("login-otp").value.trim();
  const errEl = document.getElementById("login-error");
  const res = await send({ type: "EYE_VERIFY_2FA", challenge, code });
  if (!res.ok) {
    errEl.textContent = res.error;
    return;
  }
  await init();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await send({ type: "EYE_LOGOUT" });
  await init();
});

document.getElementById("refresh-btn").addEventListener("click", loadInbox);

async function loadInbox() {
  const res = await send({ type: "EYE_GET_INBOX" });
  if (!res.ok) {
    itemsEl.innerHTML = `<p class="error">${res.error}</p>`;
    return;
  }
  const items = res.data || [];
  itemsEl.innerHTML = "";
  emptyHint.hidden = items.length > 0;
  for (const item of items) {
    itemsEl.appendChild(renderItem(item));
  }
}

function renderItem(item) {
  const el = document.createElement("div");
  el.className = "item";
  el.innerHTML = `
    <div class="meta">
      <span class="badge">${item.platform}</span>
      <span>${item.status}</span>
    </div>
    <div class="message"><strong>${item.author_name || item.author_handle || "Someone"}:</strong> ${escapeHtml(item.message || "")}</div>
    <textarea placeholder="AI draft appears here — edit before inserting">${escapeHtml(item.draft_reply || "")}</textarea>
    <div class="row">
      <button class="draft-btn">AI Draft</button>
      <button class="insert-btn secondary">Insert into page</button>
    </div>
    <div class="row">
      <button class="replied-btn secondary">Mark replied</button>
      <button class="dismiss-btn secondary">Dismiss</button>
    </div>
  `;

  const textarea = el.querySelector("textarea");

  el.querySelector(".draft-btn").addEventListener("click", async () => {
    const res = await send({ type: "EYE_DRAFT_REPLY", id: item.id });
    if (res.ok) textarea.value = res.data.reply;
  });

  el.querySelector(".insert-btn").addEventListener("click", async () => {
    const urlPattern = PLATFORM_URL_PATTERN[item.platform];
    const res = await send({ type: "EYE_FILL_REPLY", urlPattern, text: textarea.value });
    if (!res.ok) alert(res.error);
  });

  el.querySelector(".replied-btn").addEventListener("click", async () => {
    await send({ type: "EYE_SET_STATUS", id: item.id, status: "replied" });
    el.remove();
  });

  el.querySelector(".dismiss-btn").addEventListener("click", async () => {
    await send({ type: "EYE_SET_STATUS", id: item.id, status: "dismissed" });
    el.remove();
  });

  return el;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

init();
