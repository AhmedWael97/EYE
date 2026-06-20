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

  // ── Event buffer + qualification ──────────────────────────────────────────
  // We record continuously but only UPLOAD once the session "qualifies":
  //   • a friction/intent signal fired (rage/dead click, JS error, purchase…),
  //     reported by eye.js via window.__eyeReplayQualify(reason), OR
  //   • real engagement (≥ENGAGE_MS active AND ≥ENGAGE_INTERACTIONS clicks/inputs).
  // Until qualified we keep only events from the latest FullSnapshot, so the
  // first upload is always playable. This stops storing useless bounce
  // recordings and never produces broken (snapshot-less) ones.
  var buf = [];
  var qualified = false;
  var reason = null;
  var lastMeta = null;           // most recent rrweb Meta (type 4) — viewport
  var interactions = 0;
  var startTs = Date.now();
  var ENGAGE_MS = 10000;
  var ENGAGE_INTERACTIONS = 3;

  function flush() {
    if (!qualified) return;      // never upload an unqualified session
    if (!buf.length || !hasIds()) return;

    var batch = buf.splice(0);
    var payload = JSON.stringify({
      t: TOKEN, vid: getVid(), sid: getSid(), reason: reason || 'engaged', events: batch,
    });
    var url = API + '/replay';

    if (w.navigator && w.navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: 'text/plain' });
        if (w.navigator.sendBeacon(url, blob)) return;
      } catch (_) {}
    }
    try {
      if (w.fetch) {
        fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: payload, keepalive: payload.length < 60000, credentials: 'omit',
        }).catch(function () {
          try { var x = new XMLHttpRequest(); x.open('POST', url, true); x.setRequestHeader('Content-Type', 'application/json'); x.send(payload); } catch (_) {}
        });
      } else {
        var x = new XMLHttpRequest(); x.open('POST', url, true); x.setRequestHeader('Content-Type', 'application/json'); x.send(payload);
      }
    } catch (_) {
      Array.prototype.unshift.apply(buf, batch);
    }
  }

  // Mark this session worth keeping. First reason wins. Flushes the retained
  // buffer (which starts with a FullSnapshot, so playback is correct).
  function qualify(r) {
    if (qualified) return;
    qualified = true;
    reason = r || 'engaged';
    flush();
  }
  w.__eyeReplayQualify = qualify;

  function resetSession() {
    if (qualified) flush();
    buf = []; qualified = false; reason = null; lastMeta = null; interactions = 0; startTs = Date.now();
  }

  // ── Start rrweb recording ─────────────────────────────────────────────────
  function startRecording() {
    if (!hasIds()) {
      setTimeout(startRecording, 300);
      return;
    }

    record({
      emit: function (event) {
        if (event.type === 4) lastMeta = event;

        if (!qualified) {
          if (event.type === 2) {
            // New FullSnapshot — restart the buffer here (drop older idle events)
            buf = (lastMeta && lastMeta !== event) ? [lastMeta, event] : [event];
          } else {
            buf.push(event);
          }
        } else {
          buf.push(event);
          if (event.type === 2 || buf.length >= 50) flush();
        }

        // Engagement: meaningful interaction = MouseInteraction(2) or Input(5)
        if (event.type === 3 && event.data && (event.data.source === 2 || event.data.source === 5)) {
          interactions++;
          if (!qualified && interactions >= ENGAGE_INTERACTIONS && (Date.now() - startTs) >= ENGAGE_MS) {
            qualify('engaged');
          }
        }
      },
      checkoutEveryNms: 30000,        // Full DOM snapshot every 30 s (enables seeking)
      maskAllInputs:    true,
      inlineStylesheet: true,
      blockClass:       'eye-block',
      maskTextClass:    'eye-mask',
      recordCanvas: false,
      recordCrossOriginIframes: false,
      collectFonts: true
    });
  }

  // Flush every 3 s (only sends once qualified) and on page unload.
  setInterval(flush, 3000);
  w.addEventListener('pagehide',     flush);
  w.addEventListener('beforeunload', flush);

  // When eye.js rotates the session ID on SPA navigation, finalize + reset.
  var lastSid = getSid();
  setInterval(function () {
    var cur = getSid();
    if (cur !== lastSid) {
      resetSession();
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
