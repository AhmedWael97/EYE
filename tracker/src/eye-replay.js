/*!
 * EYE Replay v1.0.0 — Session recording module
 * Lazy-loaded separately from eye.js to keep the core tracker tiny.
 * Bundled by esbuild with rrweb inlined (~80 KB minified, gzipped ~25 KB).
 *
 * Usage: add data-replay="true" to the eye.js script tag, or
 *        load this script separately after eye.js.
 *
 * The rrweb recorder serialises every DOM mutation, scroll, mouse move,
 * and input change into a compact event stream that can be replayed
 * frame-by-frame in the dashboard (session replay / screenshots).
 */
/* jshint esversion:6 */
import { record } from 'rrweb';

(function (w, d) {
  'use strict';

  // ── Resolve config from the same <script> tag as eye.js ──────────────────
  function getScriptAttr(attr) {
    // Look for either the replay script itself or the main eye.js script
    var scripts = d.querySelectorAll('script[data-token]');
    for (var i = 0; i < scripts.length; i++) {
      var v = scripts[i].getAttribute(attr);
      if (v) return v;
    }
    return null;
  }

  var TOKEN  = getScriptAttr('data-token') || w.EYE_TOKEN  || '';
  var API    = getScriptAttr('data-api')   || w.EYE_API    || '/api/track';

  if (!TOKEN) return;

  // ── Read visitor / session IDs written by eye.js ─────────────────────────
  function getVid() { return w._eyeVid || (function () { try { return localStorage.getItem('_eye_vid') || ''; } catch (_) { return ''; } }()); }
  function getSid() { return w._eyeSid || (function () { try { return localStorage.getItem('_eye_sid') || ''; } catch (_) { return ''; } }()); }

  // ── Event buffer ──────────────────────────────────────────────────────────
  var buf = [];

  function flush() {
    if (!buf.length) return;
    var batch = buf.splice(0);
    var payload = JSON.stringify({
      t:      TOKEN,
      vid:    getVid(),
      sid:    getSid(),
      events: batch,
    });
    try {
      if (w.fetch) {
        fetch(API + '/replay', {
          method:      'POST',
          headers:     { 'Content-Type': 'application/json' },
          body:        payload,
          keepalive:   true,
          credentials: 'omit',
        }).catch(function () {});
      } else {
        var x = new XMLHttpRequest();
        x.open('POST', API + '/replay', true);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(payload);
      }
    } catch (_) {}
  }

  // ── Start rrweb recording ─────────────────────────────────────────────────
  function startRecording() {
    record({
      emit: function (event) {
        buf.push(event);
        // Flush immediately after a full DOM snapshot to avoid losing the
        // baseline state if the user closes the tab quickly.
        if (event.type === 2 /* FullSnapshot */ || buf.length >= 50) {
          flush();
        }
      },
      // Take a periodic full snapshot every 30 s so we can seek mid-session.
      checkoutEveryNms: 30000,
      // Privacy: mask all input values by default.
      maskAllInputs:    true,
      // Inline stylesheets so the replay looks identical to the original.
      inlineStylesheet: true,
      // Add class "eye-block" to an element to exclude it from recordings.
      blockClass:       'eye-block',
      // Add class "eye-mask" to replace text with asterisks in recordings.
      maskTextClass:    'eye-mask',
      // Don't record cross-origin iframes (CSP / privacy).
      recordCrossOriginIframes: false,
    });
  }

  // Flush every 5 s and on page unload.
  var flushInterval = setInterval(flush, 5000);
  w.addEventListener('pagehide',     flush);
  w.addEventListener('beforeunload', flush);

  // When eye.js rotates the session ID on SPA navigation, flush the current
  // buffer first so events stay associated with the correct session.
  var lastSid = getSid();
  setInterval(function () {
    var cur = getSid();
    if (cur !== lastSid) {
      flush();
      lastSid = cur;
    }
  }, 500);

  // Defer recording start off the critical render path.
  if (w.requestIdleCallback) {
    w.requestIdleCallback(startRecording, { timeout: 200 });
  } else {
    setTimeout(startRecording, 0);
  }

  // Expose flush for testing.
  w._eyeReplayFlush = flush;

}(window, document));
