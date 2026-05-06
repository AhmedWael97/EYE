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
  function hasIds() { return !!getVid() && !!getSid(); }

  // ── Event buffer ──────────────────────────────────────────────────────────
  var buf = [];

  function flush() {
    if (!buf.length) return;
    if (!hasIds()) return;

    var sid = getSid();
    var vid = getVid();
    var batch = buf.splice(0);
    var payload = JSON.stringify({
      t:      TOKEN,
      vid:    vid,
      sid:    sid,
      events: batch,
    });

    var url = API + '/replay';

    // sendBeacon sends a text/plain POST — no CORS preflight is triggered,
    // making it the most reliable cross-origin transport for analytics data.
    // The backend's Content-Type check must accept text/plain (or be flexible).
    if (w.navigator && w.navigator.sendBeacon) {
      try {
        // Wrap JSON in a Blob with text/plain to stay within the CORS
        // "simple request" category (no OPTIONS preflight).
        var blob = new Blob([payload], { type: 'text/plain' });
        if (w.navigator.sendBeacon(url, blob)) return;
      } catch (_) {}
    }

    // Fallback 1: fetch with keepalive (fires even on page unload, no preflight
    // concern here because the server already sent Access-Control-Allow-Origin:*)
    try {
      if (w.fetch) {
        var useKeepalive = payload.length < 60000;
        fetch(url, {
          method:      'POST',
          headers:     { 'Content-Type': 'application/json' },
          body:        payload,
          keepalive:   useKeepalive,
          credentials: 'omit',
        }).catch(function () {
          // Fallback 2: plain XHR
          try {
            var x = new XMLHttpRequest();
            x.open('POST', url, true);
            x.setRequestHeader('Content-Type', 'application/json');
            x.send(payload);
          } catch (_) {}
        });
      } else {
        var x = new XMLHttpRequest();
        x.open('POST', url, true);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(payload);
      }
    } catch (_) {
      Array.prototype.unshift.apply(buf, batch);
    }
  }

  // ── Start rrweb recording ─────────────────────────────────────────────────
  function startRecording() {
    if (!hasIds()) {
      setTimeout(startRecording, 300);
      return;
    }

    record({
      emit: function (event) {
        buf.push(event);

        // Flush the buffer immediately after a FullSnapshot (type 2).
        // The preceding Meta event (type 4) is already in buf at this point
        // because rrweb emits Meta → FullSnapshot consecutively, so both
        // land in the same HTTP batch in the correct order — eliminating the
        // race condition that occurred when they were flushed separately.
        if (event.type === 2) {
          flush();
        } else if (buf.length >= 50) {
          flush();
        }
      },
      checkoutEveryNms: 30000,        // Full DOM snapshot every 30 s (enables seeking)
      maskAllInputs:    true,
      inlineStylesheet: true,
      blockClass:       'eye-block',
      maskTextClass:    'eye-mask',

      // Prefer reliability over fragile canvas/iframe capture in v1.
      recordCanvas: false,
      recordCrossOriginIframes: false,
      collectFonts: true
    });
  }

  // Flush every 3 s and on page unload.
  var flushInterval = setInterval(flush, 3000);
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
  // Wait for the page to fully load + 500ms for JS framework hydration
  // (React/Next.js/Vue/Angular often render null values until API data arrives).
  // Starting too early captures skeleton/loading states with "null" text nodes.
  function scheduleRecording() {
    if (d.readyState === 'complete') {
      // Page already loaded — still wait 500ms for framework hydration
      setTimeout(startRecording, 500);
    } else {
      w.addEventListener('load', function () {
        // Extra 500ms after load event for framework hydration
        setTimeout(startRecording, 500);
      }, { once: true });
    }
  }
  scheduleRecording();

  // Expose flush for testing.
  w._eyeReplayFlush = flush;

}(window, document));
