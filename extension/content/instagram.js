// Instagram content script — BEST EFFORT / UNVERIFIED.
//
// Same caveat as content/facebook.js: written without a live logged-in
// Instagram session to test against, Instagram's web app markup is
// similarly obfuscated, and this needs real-account verification before it
// can be trusted. Starting point only.
//
// Same safety model as content/x.js: read-only scraping of what's already on
// screen in the user's own logged-in session, and "fill" never auto-submits.

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
  scrapeTimer = setTimeout(scrapeVisibleComments, SCRAPE_DEBOUNCE_MS);
}

function scrapeVisibleComments() {
  if (!isExtensionContextValid()) return;
  const items = [];

  // TODO(verify): comment rows on a post page are typically <ul><li> with an
  // inner <h3>/<span> for the author and a sibling <span> for the comment
  // text — confirm current structure on a real logged-in account.
  const commentNodes = document.querySelectorAll("ul li[role='menuitem'], ul li");

  commentNodes.forEach((node) => {
    const authorEl = node.querySelector("h3 a, a[role='link']");
    const textEl = node.querySelector("span");
    const authorHandle = authorEl ? authorEl.innerText.trim() : null;
    const message = textEl ? textEl.innerText.trim() : "";
    if (!authorHandle || !message) return;

    const externalId = `ig_${hash(authorHandle + "|" + message + "|" + location.pathname)}`;

    items.push({
      platform: "instagram",
      item_type: "comment",
      external_id: externalId,
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

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function fillReplyBox(text) {
  // TODO(verify): the comment composer is a <textarea aria-label="Add a
  // comment…"> on post pages — confirm on a live account (DMs use a
  // different, contenteditable composer under instagram.com/direct/).
  const textarea = document.querySelector('textarea[aria-label*="omment"]');
  if (!textarea || textarea.offsetParent === null) return false;

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  ).set;
  nativeSetter.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
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
