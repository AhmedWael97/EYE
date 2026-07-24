// X (Twitter) content script.
//
// This only reads what's already rendered in the DOM of a page the signed-in
// user has open in their own browser (their own session) — it never touches
// cookies/tokens, and it never submits anything on its own. "Insert into
// page" only fills the compose box; the user still clicks X's own
// Reply/Post button.
//
// Selectors below follow X's public `data-testid` attributes, which are
// comparatively stable, but X changes markup over time — if scraping stops
// working, these are the lines to update.

const SCRAPE_DEBOUNCE_MS = 1500;
let scrapeTimer = null;

// True once the extension is reloaded/updated while this tab is still open —
// chrome.runtime dies but this content script (and its MutationObserver) keeps
// running until the tab is refreshed. Without this check it throws "Extension
// context invalidated" on every DOM mutation, forever.
function isExtensionContextValid() {
  return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
}

function scheduleScrape() {
  if (!isExtensionContextValid()) {
    observer.disconnect();
    return;
  }
  clearTimeout(scrapeTimer);
  scrapeTimer = setTimeout(scrapeVisibleTweets, SCRAPE_DEBOUNCE_MS);
}

function scrapeVisibleTweets() {
  if (!isExtensionContextValid()) return;
  const items = [];
  const tweetNodes = document.querySelectorAll('article[data-testid="tweet"]');

  tweetNodes.forEach((node) => {
    const textEl = node.querySelector('[data-testid="tweetText"]');
    const message = textEl ? textEl.innerText.trim() : "";
    if (!message) return;

    const statusLink = Array.from(node.querySelectorAll('a[href*="/status/"]'))[0];
    const href = statusLink ? statusLink.getAttribute("href") : null;
    if (!href) return; // no stable id to dedupe on — skip

    const match = href.match(/^\/([^/]+)\/status\/(\d+)/);
    const authorHandle = match ? match[1] : null;
    const tweetId = match ? match[2] : href;

    items.push({
      platform: "x",
      item_type: "mention",
      external_id: tweetId,
      author_handle: authorHandle,
      author_name: authorHandle,
      message: message.slice(0, 2000),
      page_url: location.href,
    });
  });

  if (items.length && isExtensionContextValid()) {
    try {
      chrome.runtime.sendMessage({ type: "EYE_SYNC_ITEMS", items });
    } catch (err) {
      observer.disconnect();
    }
  }
}

function fillReplyBox(text) {
  // The active compose box uses data-testid like "tweetTextarea_0" (or
  // "_1", "_2", ... for quote/thread composers) and is contenteditable.
  const candidates = Array.from(
    document.querySelectorAll('[data-testid^="tweetTextarea_"]')
  ).filter((el) => el.offsetParent !== null); // visible only

  const box = candidates[0];
  if (!box) return false;

  box.focus();
  document.execCommand("insertText", false, text);
  box.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EYE_FILL_REPLY_ON_PAGE") {
    const ok = fillReplyBox(message.text);
    sendResponse({ ok });
  }
  return true;
});

const observer = new MutationObserver(scheduleScrape);
observer.observe(document.body, { childList: true, subtree: true });
scheduleScrape();
