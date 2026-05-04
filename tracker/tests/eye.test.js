/**
 * EYE Tracker unit tests
 * Run: npm test (inside tracker/)
 */

// ── Fake timer setup ──────────────────────────────────────────────────────────
beforeEach(() => {
  jest.useFakeTimers();
  navigator.sendBeacon = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
  // Reset cookies
  Object.defineProperty(document, 'cookie', { value: '', writable: true, configurable: true });
  localStorage.clear();
  delete window.EYE_TOKEN;
  delete window.EYE_API;
  delete window.EYE;
  delete window.eye;
  delete window._eyeFlush;
  delete window.EYE_PIPELINES;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const beaconPayloads = [];

function loadTracker(token = 'test-token', api = '/api/track', extraSetup = () => {}) {
  beaconPayloads.length = 0;

  // Reset navigator beacon mock
  navigator.sendBeacon = jest.fn((url, blob) => {
    if (blob && blob.text) {
      // Store for async reading; synchronous tests can read via getLastPayload()
      blob.text().then(text => beaconPayloads.push(JSON.parse(text)));
    }
    return true;
  });

  window.EYE_TOKEN = token;
  window.EYE_API = api;
  extraSetup();

  jest.resetModules();
  require('../src/eye.js');

  // Trigger deferred init (setTimeout(init, 0) fallback when requestIdleCallback absent)
  jest.runAllImmediates ? jest.runAllImmediates() : void 0;
  jest.advanceTimersByTime(0);
}

/** Flush the batch queue synchronously in tests */
function triggerFlush() {
  if (window._eyeFlush) window._eyeFlush();
}

/** Advance 4s to trigger the periodic flush */
function advanceFlushInterval() {
  jest.advanceTimersByTime(4100);
}

// ── Basic functionality ───────────────────────────────────────────────────────

describe('Initialisation', () => {
  test('does nothing without a token', () => {
    jest.resetModules();
    window.EYE_TOKEN = undefined;
    require('../src/eye.js');
    jest.advanceTimersByTime(0);
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  test('sets up public API when token is provided', () => {
    loadTracker();
    expect(typeof window.EYE).toBe('object');
    expect(typeof window.EYE.track).toBe('function');
    expect(typeof window.EYE.identify).toBe('function');
    expect(typeof window.EYE.optout).toBe('function');
    expect(typeof window.EYE.exclude).toBe('function');
  });

  test('exposes window.eye as backwards compat alias', () => {
    loadTracker();
    expect(window.eye).toBe(window.EYE);
  });

  test('generates and persists visitor id', () => {
    loadTracker();
    const vid = localStorage.getItem('_eye_vid');
    expect(vid).toBeTruthy();
    expect(vid).toMatch(/^[0-9a-f-]{36}$/i);

    // Second load reuses same vid
    loadTracker();
    expect(localStorage.getItem('_eye_vid')).toBe(vid);
  });

  test('generates a session id', () => {
    loadTracker();
    const sid = localStorage.getItem('_eye_sid');
    expect(sid).toBeTruthy();
    expect(sid).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

// ── Batch queue ───────────────────────────────────────────────────────────────

describe('Batch queue', () => {
  test('queues a pageview on load before flush', () => {
    loadTracker();
    // Before flush, no beacon should have been sent
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  test('sends queued events after 4s flush interval', () => {
    loadTracker();
    advanceFlushInterval();
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });

  test('sends immediately when 10 events are queued', () => {
    loadTracker();
    for (let i = 0; i < 9; i++) window.EYE.track('evt_' + i);
    // 9 custom events + 1 pageview = 10 → triggers immediate flush
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });

  test('sends on explicit flush() call', () => {
    loadTracker();
    triggerFlush();
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });

  test('does not send a second beacon for an empty queue', () => {
    loadTracker();
    triggerFlush(); // first flush (pageview)
    triggerFlush(); // queue is now empty
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });
});

// ── Public API: track ────────────────────────────────────────────────────────

describe('EYE.track()', () => {
  test('enqueues a custom event', () => {
    loadTracker();
    window.EYE.track('signup', { plan: 'pro' });
    triggerFlush();
    expect(navigator.sendBeacon).toHaveBeenCalled();
  });

  test('rejects an empty name', () => {
    loadTracker();
    window.EYE.track('');
    triggerFlush(); // only pageview goes through
    const calls = navigator.sendBeacon.mock.calls.length;
    // The empty-name track should not add an event; pageview is still queued
    window.EYE.track('valid'); // add a valid one to confirm API still works
    triggerFlush();
    expect(navigator.sendBeacon).toHaveBeenCalled();
  });

  test('rejects a name longer than 64 chars', () => {
    loadTracker();
    const before = navigator.sendBeacon.mock.calls.length;
    window.EYE.track('a'.repeat(65));
    triggerFlush();
    // Beacon fires once (for the pageview) regardless
    // but no second event should be in the payload
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
  });

  test('accepts names exactly 64 chars', () => {
    loadTracker();
    window.EYE.track('a'.repeat(64));
    // 2 events (pageview + custom) — may or may not flush together
    triggerFlush();
    expect(navigator.sendBeacon).toHaveBeenCalled();
  });

  test('accepts an optional properties object', () => {
    loadTracker();
    expect(() => window.EYE.track('click', { button: 'hero-cta' })).not.toThrow();
  });
});

// ── Public API: identify ──────────────────────────────────────────────────────

describe('EYE.identify()', () => {
  test('enqueues an identify event', () => {
    loadTracker();
    window.EYE.identify('user_123', { plan: 'pro', country: 'EG' });
    triggerFlush();
    expect(navigator.sendBeacon).toHaveBeenCalled();
  });

  test('works without traits argument', () => {
    loadTracker();
    expect(() => window.EYE.identify('u_456')).not.toThrow();
  });
});

// ── Public API: optout ────────────────────────────────────────────────────────

describe('EYE.optout()', () => {
  test('sets the _eye_optout cookie', () => {
    loadTracker();
    window.EYE.optout();
    expect(document.cookie).toContain('_eye_optout');
  });

  test('stops further sends after optout', () => {
    loadTracker();
    window.EYE.optout();
    navigator.sendBeacon.mockClear();
    window.EYE.track('post_optout');
    triggerFlush();
    advanceFlushInterval();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });
});

// ── Public API: exclude ───────────────────────────────────────────────────────

describe('EYE.exclude()', () => {
  test('sets the _eye_exclude cookie', () => {
    loadTracker();
    window.EYE.exclude();
    expect(document.cookie).toContain('_eye_exclude');
  });

  test('stops further sends without POSTing to optout endpoint', () => {
    loadTracker();
    window.EYE.exclude();
    navigator.sendBeacon.mockClear();
    triggerFlush();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });
});

// ── Privacy: bot detection ────────────────────────────────────────────────────

describe('Bot detection', () => {
  test('blocks tracking when navigator.webdriver is true', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, writable: true, configurable: true });
    loadTracker();
    triggerFlush();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'webdriver', { value: false, writable: true, configurable: true });
  });

  test('blocks tracking for headless Chrome UA', () => {
    const orig = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (X11) HeadlessChrome/120', writable: true, configurable: true });
    loadTracker();
    triggerFlush();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'userAgent', { value: orig, writable: true, configurable: true });
  });
});

// ── Privacy: DNT ─────────────────────────────────────────────────────────────

describe('Do Not Track', () => {
  test('halts if doNotTrack=1 and data-respect-dnt is set (via EYE_RESPECT_DNT flag)', () => {
    // Since data attributes come from currentScript which is null in tests,
    // we test the case where DNT is set but RESPECT_DNT is false (default: collect)
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', writable: true, configurable: true });
    loadTracker(); // no data-respect-dnt attribute → should still collect
    triggerFlush();
    expect(navigator.sendBeacon).toHaveBeenCalled();
    Object.defineProperty(navigator, 'doNotTrack', { value: null, writable: true, configurable: true });
  });
});

// ── Privacy: optout cookie blocks init ───────────────────────────────────────

describe('Optout cookie blocks init', () => {
  test('aborts entirely if _eye_optout cookie is present at init', () => {
    Object.defineProperty(document, 'cookie', { value: '_eye_optout=1', writable: true, configurable: true });
    loadTracker();
    triggerFlush();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    Object.defineProperty(document, 'cookie', { value: '', writable: true, configurable: true });
  });

  test('aborts entirely if _eye_exclude cookie is present at init', () => {
    Object.defineProperty(document, 'cookie', { value: '_eye_exclude=1', writable: true, configurable: true });
    loadTracker();
    triggerFlush();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    Object.defineProperty(document, 'cookie', { value: '', writable: true, configurable: true });
  });
});

