/*!
 * EYE A/B v1.0.0 — experiment apply engine (lazy-loaded by eye.js).
 *
 * Fetches the running experiments for this domain, assigns the visitor to a
 * variation by weight (deterministic + sticky), applies it, and records the
 * exposure via EYE.experiment(). Two types:
 *   - "ab":         inject the variation's CSS/JS on the current page.
 *   - "split_url":  redirect the visitor to the variation's URL.
 * Control variation = the page as-is (no change / no redirect).
 */
/* jshint esversion:6 */
(function (w, d) {
  'use strict';

  function attr(name) {
    var s = d.querySelectorAll('script[data-token]');
    for (var i = 0; i < s.length; i++) { var v = s[i].getAttribute(name); if (v) return v; }
    return null;
  }
  var TOKEN = attr('data-token') || w.EYE_TOKEN || '';
  var API = attr('data-api') || w.EYE_API || '/api/track';
  if (!TOKEN) return;

  function vid() { return w._eyeVid || (function () { try { return localStorage.getItem('_eye_vid') || ''; } catch (_) { return ''; } }()); }

  // Stable 0..99 bucket from (visitor id + experiment key).
  function bucket(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
    return Math.abs(h) % 100;
  }

  // Deterministic + sticky variation assignment, respecting weights.
  function pickVariation(exp) {
    var vars = exp.variations || [];
    if (!vars.length) return null;

    var storeKey = '_eye_ab_' + exp.key;
    var stored = null;
    try { stored = localStorage.getItem(storeKey); } catch (_) {}
    if (stored) { for (var i = 0; i < vars.length; i++) { if (vars[i].key === stored) return vars[i]; } }

    var total = 0;
    for (var j = 0; j < vars.length; j++) { total += (vars[j].weight || 0); }
    if (total <= 0) { total = vars.length; for (var t = 0; t < vars.length; t++) { vars[t].weight = 1; } }

    var b = bucket(vid() + ':' + exp.key) / 100 * total;
    var acc = 0, chosen = vars[vars.length - 1];
    for (var k = 0; k < vars.length; k++) { acc += (vars[k].weight || 0); if (b < acc) { chosen = vars[k]; break; } }
    try { localStorage.setItem(storeKey, chosen.key); } catch (_) {}
    return chosen;
  }

  function applyAB(v) {
    if (v.css) {
      var st = d.createElement('style');
      st.setAttribute('data-eye-ab', '1');
      st.textContent = v.css;
      (d.head || d.documentElement).appendChild(st);
    }
    if (v.js) {
      try { (new Function(v.js))(); } catch (e) { /* customer variation code error — never break the page */ }
    }
  }

  function expose(expKey, varKey) {
    try { if (w.EYE && w.EYE.experiment) w.EYE.experiment(expKey, varKey); } catch (_) {}
  }

  // Match the experiment's target page against the current URL (same path).
  function pathMatch(target) {
    if (!target) return false;
    try {
      var u = new URL(target, location.href);
      return u.origin === location.origin &&
        location.pathname.replace(/\/$/, '') === u.pathname.replace(/\/$/, '');
    } catch (e) {
      return location.href.indexOf(target) === 0;
    }
  }

  function run(experiments) {
    for (var i = 0; i < experiments.length; i++) {
      var exp = experiments[i];
      if (!pathMatch(exp.target_url)) continue;
      var v = pickVariation(exp);
      if (!v) continue;

      if (exp.type === 'split_url') {
        if (!v.is_control && v.redirect) {
          var dest = new URL(v.redirect, location.href).href;
          if (dest.replace(/\/$/, '') !== location.href.replace(/\/$/, '')) {
            expose(exp.key, v.key);
            try { if (w.EYE && w.EYE.flush) w.EYE.flush(); } catch (_) {}
            location.replace(dest);
            return; // navigating away — stop processing
          }
        }
        expose(exp.key, v.key);
      } else { // "ab"
        if (!v.is_control) applyAB(v);
        expose(exp.key, v.key);
      }
    }
  }

  function start() {
    if (!vid()) { setTimeout(start, 200); return; } // wait for eye.js to set the visitor id
    var origin = API.replace(/\/api\/(collect|track).*$/, '');
    if (origin === API) { try { origin = new URL(API, location.href).origin; } catch (e) { origin = ''; } }
    var url = origin + '/api/v1/experiments/active?t=' + encodeURIComponent(TOKEN);
    try {
      fetch(url, { credentials: 'omit' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var data = (j && j.data) ? j.data : j;
          var exps = (data && data.experiments) || [];
          if (exps.length) run(exps);
        })
        .catch(function () {});
    } catch (_) {}
  }

  // Apply as early as possible (no anti-flicker snippet, per config).
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();

}(window, document));
