/*!
 * EYE Analytics Tracker v1.0.0
 * Lightweight visitor tracking snippet — target < 4 KB gzipped
 */
/* jshint esversion:6 */
(function (w, d, n) {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────────────────
  var el = d.currentScript;
  var TOKEN = (el && el.getAttribute('data-token')) || w.EYE_TOKEN;
  if (!TOKEN) return;

  var API = (el && el.getAttribute('data-api')) || w.EYE_API || '/api/track';
  var RESPECT_DNT = el && el.getAttribute('data-respect-dnt') === 'true';

  // ── Bot detection ─────────────────────────────────────────────────────────
  if (n.webdriver || /HeadlessChrome|Puppeteer|Playwright|PhantomJS|SlimerJS/i.test(n.userAgent || '')) return;

  // ── Cookie helpers ────────────────────────────────────────────────────────
  function getCookie(name) {
    var m = (d.cookie || '').match('(?:^|; )' + name + '=([^;]*)');
    return m ? m[1] : null;
  }
  function setCookie(name, val, days) {
    d.cookie = name + '=' + val + '; max-age=' + (days * 86400) + '; path=/; SameSite=Lax';
  }

  // ── Privacy checks ────────────────────────────────────────────────────────
  if (RESPECT_DNT && n.doNotTrack === '1') return;
  if (getCookie('_eye_optout') || getCookie('_eye_exclude')) return;

  // ── Storage helpers ───────────────────────────────────────────────────────
  function store(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  // ── UUID v4 ───────────────────────────────────────────────────────────────
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : r & 3 | 8).toString(16);
    });
  }

  // ── Visitor / Session IDs ─────────────────────────────────────────────────
  var SESSION_GAP = 1800000; // 30 min
  var vid, sid;

  function initIds() {
    vid = load('_eye_vid');
    if (!vid) { vid = uuid(); store('_eye_vid', vid); }
    var savedSid = load('_eye_sid'), savedTs = +(load('_eye_sid_ts') || 0);
    sid = (savedSid && Date.now() - savedTs < SESSION_GAP) ? savedSid : uuid();
    store('_eye_sid', sid);
    store('_eye_sid_ts', String(Date.now()));
  }

  // ── Batch queue ───────────────────────────────────────────────────────────
  var queue = [];
  var flushTimer;

  function flush() {
    if (!queue.length) return;
    var batch = queue.splice(0);
    var body = JSON.stringify(batch);
    try {
      if (n.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        n.sendBeacon(API, blob);
        return;
      }
    } catch (_) {}
    if (w.fetch) {
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true, credentials: 'omit' }).catch(function () {});
    } else {
      var x = new XMLHttpRequest();
      x.open('POST', API, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(body);
    }
  }

  function enqueue(type, extra) {
    if (getCookie('_eye_optout') || getCookie('_eye_exclude')) return;
    if (!vid) initIds();
    var ev = {
      t: TOKEN, e: type,
      u: d.location ? d.location.href : '',
      r: d.referrer || '',
      pt: d.title || '',
      sw: w.screen ? w.screen.width : 0,
      sh: w.screen ? w.screen.height : 0,
      vid: vid, sid: sid,
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      }
    }
    queue.push(ev);
    if (queue.length >= 10) { clearInterval(flushTimer); flush(); flushTimer = setInterval(flush, 4000); }
  }

  function startFlushTimer() {
    flushTimer = setInterval(flush, 4000);
  }

  // ── Page timing + UTM ─────────────────────────────────────────────────────
  var pageAt = Date.now();
  var lastUrl = d.location ? d.location.href : '';
  var utm = {};
  var scrollFired = {};
  var scrollLastY = 0;
  var scrollLastDir = '';
  var scrollDirTimes = [];

  function parseUtm() {
    try {
      var p = new URLSearchParams(d.location ? d.location.search : '');
      var keys = ['source', 'medium', 'campaign', 'term', 'content'];
      for (var i = 0; i < keys.length; i++) {
        var v = p.get('utm_' + keys[i]);
        if (v) utm['u' + keys[i][0]] = v;
      }
    } catch (_) {}
  }

  function doPageview() {
    enqueue('pageview', utm.us ? { us: utm.us, um: utm.um, uc: utm.uc, ut: utm.ut, ux: utm.ux } : undefined);
    matchPipelines();
  }

  // ── Selector helper ───────────────────────────────────────────────────────
  function selectorOf(el) {
    if (!el || typeof el.tagName !== 'string') return '';
    if (el.id) return '#' + el.id;
    var s = el.tagName.toLowerCase();
    if (el.className) s += '.' + String(el.className).trim().split(/\s+/).join('.');
    return s;
  }

  function targetMeta(el) {
    if (!el || typeof el.tagName !== 'string') return {};
    var text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var classes = (typeof el.className === 'string' ? el.className : '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return {
      el: selectorOf(el),
      tg: (el.tagName || '').toLowerCase(),
      id: (el.id || '').slice(0, 80),
      cl: classes,
      tx: text,
      ar: (el.getAttribute && (el.getAttribute('aria-label') || '') || '').slice(0, 80),
      rl: (el.getAttribute && (el.getAttribute('role') || '') || '').slice(0, 40),
      hr: (el.getAttribute && (el.getAttribute('href') || '') || '').slice(0, 200),
      nm: (el.getAttribute && (el.getAttribute('name') || '') || '').slice(0, 80),
      tp: (el.getAttribute && (el.getAttribute('type') || '') || '').slice(0, 40),
    };
  }

  function resolveClickableTarget(el) {
    if (!el || !el.closest) return el;
    return el.closest('button,a,[role="button"],input[type="button"],input[type="submit"],[data-eye-track],[onclick]') || el;
  }

  // ── Pipeline step matching ────────────────────────────────────────────────
  function matchPipelines() {
    var url = d.location ? d.location.href : '';
    var steps = w.EYE_PIPELINES || [];
    for (var i = 0; i < steps.length; i++) {
      try {
        if (new RegExp(steps[i].pattern).test(url)) {
          enqueue('pipeline_step', { pid: steps[i].pipeline_id, stid: steps[i].step_id });
        }
      } catch (_) {}
    }
  }

  // ── Full init (deferred) ──────────────────────────────────────────────────
  function init() {
    initIds();    w._eyeVid = vid;
    w._eyeSid = sid;    parseUtm();
    doPageview();

    // Scroll depth + excessive scroll detection
    w.addEventListener('scroll', function () {
      var nowY = w.scrollY;
      var scrolled = nowY + w.innerHeight;
      var total = (d.documentElement && d.documentElement.scrollHeight) || 1;
      var pct = Math.round(scrolled / total * 100);
      var marks = [25, 50, 75, 100];
      for (var i = 0; i < marks.length; i++) {
        if (pct >= marks[i] && !scrollFired[marks[i]]) {
          scrollFired[marks[i]] = 1;
          enqueue('scroll_depth', { depth: marks[i] });
        }
      }
      // Excessive scroll: 3+ direction reversals within 2 seconds
      var dir = nowY > scrollLastY ? 'd' : 'u';
      if (scrollLastDir && dir !== scrollLastDir) {
        var now = Date.now();
        scrollDirTimes = scrollDirTimes.filter(function (t) { return now - t < 2000; });
        scrollDirTimes.push(now);
        if (scrollDirTimes.length >= 3) {
          enqueue('excessive_scroll', { changes: scrollDirTimes.length, y: Math.round(nowY) });
          scrollDirTimes = [];
        }
      }
      scrollLastDir = dir;
      scrollLastY = nowY;
    }, { passive: true });

    // Time on page / visibility
    d.addEventListener('visibilitychange', function () {
      if (d.visibilityState === 'hidden') {
        enqueue('time_on_page', { d: Math.round((Date.now() - pageAt) / 1000) });
        flush();
      }
    });

    // Heartbeat — send time_on_page every 30 s while the tab is visible.
    // Ensures sessions are not reported as 0-duration when the tab is closed
    // abruptly (e.g. mobile Safari where visibilitychange is unreliable).
    var heartbeatTimer;
    function startHeartbeat() {
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(function () {
        if (d.visibilityState !== 'hidden') {
          enqueue('time_on_page', { d: Math.round((Date.now() - pageAt) / 1000) });
          flush();
        }
      }, 30000);
    }
    startHeartbeat();

    // JS errors
    w.addEventListener('error', function (ev) {
      enqueue('js_error', {
        msg: ev.message || '', src: ev.filename || '',
        ln: ev.lineno || 0, col: ev.colno || 0,
        stk: ev.error && ev.error.stack ? ev.error.stack.slice(0, 500) : '',
      });
    });
    w.addEventListener('unhandledrejection', function (ev) {
      var msg = ev.reason ? (ev.reason.message || String(ev.reason)) : 'Unhandled rejection';
      enqueue('js_error', { msg: msg, stk: ev.reason && ev.reason.stack ? ev.reason.stack.slice(0, 500) : '' });
    });

    // Rage click + dead click + opted-in clicks
    var clickBuf = [];
    d.addEventListener('click', function (ev) {
      var x = ev.clientX, y = ev.clientY, now = Date.now();
      var primaryTarget = resolveClickableTarget(ev.target);
      var baseClickMeta = targetMeta(primaryTarget);
      baseClickMeta.x = Math.round(x);
      baseClickMeta.y = Math.round(y);
      clickBuf = clickBuf.filter(function (c) { return now - c.t < 600; });
      clickBuf.push({ x: x, y: y, t: now });

      // Capture normal clicks so the dashboard can render true click heatmaps.
      enqueue('click', baseClickMeta);

      var nearby = clickBuf.filter(function (c) {
        var dx = c.x - x, dy = c.y - y;
        return Math.sqrt(dx * dx + dy * dy) <= 30;
      });
      if (nearby.length >= 3) {
        var rageMeta = targetMeta(primaryTarget);
        rageMeta.x = Math.round(x);
        rageMeta.y = Math.round(y);
        enqueue('rage_click', rageMeta);
        clickBuf = [];
      }
      if (ev.target && ev.target.closest) {
        var tracked = ev.target.closest('[data-eye-track]');
        if (tracked) {
          var trackedLabel = tracked.getAttribute('data-eye-track') || '';
          if (trackedLabel) {
            enqueue('custom', { e: 'tracked_click', p: { label: trackedLabel, el: baseClickMeta.el, x: baseClickMeta.x, y: baseClickMeta.y } });
          }
        }
      }
      // Dead click — no DOM mutation within 500ms, and target is not a known
      // non-interactive element (links and form fields always "respond" via browser).
      var tag = (primaryTarget.tagName || '').toLowerCase();
      var isNativeInteractive = tag === 'a' || tag === 'input' || tag === 'select' ||
        tag === 'textarea' || tag === 'button' || tag === 'label';
      if (w.MutationObserver && d.documentElement && !isNativeInteractive) {
        var changed = false;
        var obs = new MutationObserver(function () { changed = true; obs.disconnect(); });
        obs.observe(d.documentElement, { childList: true, subtree: true, attributes: true });
        setTimeout(function () {
          obs.disconnect();
          if (!changed) {
            var deadMeta = targetMeta(primaryTarget);
            deadMeta.x = Math.round(x);
            deadMeta.y = Math.round(y);
            enqueue('dead_click', deadMeta);
          }
        }, 500);
      }
      matchPipelines();
    }, true);

    // Form abandon
    var focused = {};
    d.addEventListener('focusin', function (ev) {
      var f = ev.target && ev.target.form;
      if (f) focused[selectorOf(f)] = 1;
    }, true);
    d.addEventListener('submit', function (ev) { delete focused[selectorOf(ev.target)]; }, true);
    w.addEventListener('beforeunload', function () {
      var keys = Object.keys(focused);
      for (var i = 0; i < keys.length; i++) enqueue('form_abandon', { form: keys[i] });
    });

    // Broken link preflight
    d.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href[0] === '#' || href.indexOf('javascript:') === 0) return;
      try {
        fetch(href, { method: 'HEAD', mode: 'no-cors' }).then(function (r) {
          if (r.status === 404) {
            var linkMeta = targetMeta(a);
            linkMeta.url = href;
            enqueue('broken_link', linkMeta);
          }
        }).catch(function () {});
      } catch (_) {}
    }, true);

    // Web Vitals
    if (w.PerformanceObserver) {
      var v = { lcp: 0, cls: 0, inp: 0 };
      var vSent = false;
      var reportVitals = function () {
        if (vSent) return; vSent = true;
        var r = v.lcp < 2500 && v.cls < 0.1 && v.inp < 200 ? 'good' : v.lcp < 4000 && v.cls < 0.25 && v.inp < 500 ? 'needs-improvement' : 'poor';
        enqueue('custom', { e: 'web_vitals', p: { lcp: v.lcp, cls: Math.round(v.cls * 1000) / 1000, inp: v.inp, rating: r } });
      };
      var tryObs = function (type, cb) {
        try { new PerformanceObserver(function (l) { l.getEntries().forEach(cb); }).observe({ type: type, buffered: true }); } catch (_) {}
      };
      tryObs('largest-contentful-paint', function (e) { v.lcp = Math.round(e.startTime); });
      tryObs('layout-shift', function (e) { if (!e.hadRecentInput) v.cls += e.value; });
      try {
        new PerformanceObserver(function (l) {
          l.getEntries().forEach(function (e) {
            var inp = Math.round(e.processingStart - e.startTime);
            if (inp > v.inp) v.inp = inp;
          });
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
      } catch (_) {}
      w.addEventListener('pagehide', reportVitals);
      d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden') reportVitals(); });
    }

    // SPA route changes
    var onRoute = function (isBack) {
      var cur = d.location ? d.location.href : '';
      if (cur !== lastUrl) {
        var spent = Math.round((Date.now() - pageAt) / 1000);
        enqueue('time_on_page', { d: spent });
        // Quick back: user navigated back within 5 seconds of arriving
        if (isBack && spent < 5) {
          enqueue('quick_back', { from: lastUrl, ms: spent * 1000 });
          flush();
        }
        lastUrl = cur; pageAt = Date.now(); utm = {}; scrollFired = {};
        sid = uuid(); store('_eye_sid', sid); store('_eye_sid_ts', String(Date.now()));
        w._eyeSid = sid;
        parseUtm();
        doPageview();
        startHeartbeat(); // Restart heartbeat for the new page
      }
    };
    if (w.history) {
      ['pushState', 'replaceState'].forEach(function (m) {
        var orig = w.history[m];
        if (orig) w.history[m] = function () { var r = orig.apply(this, arguments); onRoute(false); return r; };
      });
    }
    w.addEventListener('popstate', function () { onRoute(true); });
    w.addEventListener('hashchange', function () { onRoute(false); });

    startFlushTimer();
  }

  // Flush on unload (before init may fire)
  w.addEventListener('pagehide', flush);
  w.addEventListener('beforeunload', flush);

  // Expose flush for testing + phase 2 extensions
  w._eyeFlush = flush;

  // Deferred init — defer heavy attachment work off the critical render path
  if (w.requestIdleCallback) {
    w.requestIdleCallback(init, { timeout: 100 });
  } else {
    setTimeout(init, 0);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  w.EYE = {
    track: function (name, props) {
      if (typeof name !== 'string' || !name || name.length > 64) return;
      enqueue('custom', { e: name, p: props || {} });
    },
    identify: function (externalId, traits) {
      enqueue('identify', { eid: externalId, p: traits || {} });
    },
    optout: function () {
      setCookie('_eye_optout', '1', 365);
      try { fetch(API + '/optout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: TOKEN, vid: vid }), credentials: 'omit' }).catch(function () {}); } catch (_) {}
      queue = []; clearInterval(flushTimer);
    },
    exclude: function () {
      setCookie('_eye_exclude', '1', 365);
      queue = []; clearInterval(flushTimer);
    },
    flush: flush,
  };

  // Backwards compat alias
  w.eye = w.EYE;

}(window, document, navigator));
