// Facebook content script — BEST EFFORT / UNVERIFIED.
//
// Facebook's web app uses randomized, frequently-rotating class names with
// no stable public equivalent to X's `data-testid` attributes, and this was
// written without a live logged-in Facebook session to test against. The
// selectors below use Facebook's accessibility (aria) attributes, which tend
// to be more stable than class names, but expect to need to adjust them
// after testing against a real account — treat this file as a starting
// point, not a finished scraper.
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

  // TODO(verify): Facebook labels each comment container roughly as
  // `aria-label="Comment by <name>"` — confirm on a real logged-in page and
  // adjust the selector/parsing below if the label format has changed.
  const commentNodes = document.querySelectorAll('div[aria-label^="Comment by "]');

  commentNodes.forEach((node, idx) => {
    const label = node.getAttribute("aria-label") || "";
    const authorName = label.replace(/^Comment by /, "").trim() || null;
    const textNode = node.querySelector('div[dir="auto"]');
    const message = textNode ? textNode.innerText.trim() : "";
    if (!message) return;

    // No reliable per-comment id without deeper testing — hash the visible
    // text + author + page as a best-effort dedupe key.
    const externalId = `fb_${hash(authorName + "|" + message + "|" + location.pathname)}`;

    items.push({
      platform: "facebook",
      item_type: "comment",
      external_id: externalId,
      author_name: authorName,
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
  // TODO(verify): Facebook's comment/reply composer is a contenteditable
  // div, commonly aria-labelled "Write a comment…" or "Write a public
  // reply…" — confirm exact label text on a live account.
  const candidates = Array.from(
    document.querySelectorAll('div[contenteditable="true"][aria-label*="omment"]')
  ).filter((el) => el.offsetParent !== null);

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
