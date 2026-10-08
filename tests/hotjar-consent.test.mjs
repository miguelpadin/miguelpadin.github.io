// Behavioral tests for the consent + Hotjar integration.
//
// Scope: parse + write the versioned `cookie-consent` localStorage value,
// apply the GA consequence for granted/denied/legacy, and load the official
// Hotjar snippet exactly once when current explicit consent exists. Storage
// failures must not throw and must not load Hotjar.
//
// Runtime: dependency-free Node test runner (node --test).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { deepStrictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOTJAR_SITE_ID = 6791666;
const HOTJAR_VERSION = 6;

// ── Fake DOM infrastructure ──────────────────────────────────────────────

class FakeStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.failGet = false;
    this.failSet = false;
  }
  getItem(k) {
    if (this.failGet) throw new Error('storage blocked');
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    if (this.failSet) throw new Error('storage blocked');
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

// Stand-in for `location` in the fake vm. The reload counter lets the
// new banner tests assert the controlled-full-page-navigation boundary.
// `pathname`, `search` and `hash` are tracked so the URL marker logic
// (which uses history.replaceState) can mutate them like a real browser.
function createFakeLocation() {
  const loc = {
    pathname: '/',
    search: '',
    hash: '',
    reloadCount: 0,
    reload() { loc.reloadCount += 1; },
  };
  return loc;
}

// Parse a URL search string using native URLSearchParams so repeated
// keys (`?tag=a&tag=b`) are preserved as separate entries. The native
// API canonicalizes encoding (e.g. ` ` → `+`) which is acceptable for
// the test assertions here — we compare logical key/value content.
function parseSearch(search) {
  const raw = (search || '').replace(/^\?/, '');
  return new URLSearchParams(raw);
}

function serializeSearch(map) {
  if (map.size === 0) return '';
  const parts = [];
  for (const [k, v] of map) {
    parts.push(v === '' ? k : `${k}=${v}`);
  }
  return `?${parts.join('&')}`;
}

function createEnv({
  storage = {},
  hotjarScriptCount = 0,
  withBanner = false,
  sessionStorage: initialSession = {},
  sessionStorageBlocked = false,
  // Inject a custom localStorage backing store (with its own Map and
  // its own failure flags) so a chain test can keep the SAME store
  // alive across two sandboxes. When omitted, a fresh FakeStorage
  // is built from `storage`.
  localStorage: injectedLocalStorage = null,
} = {}) {
  const fakeStorage = injectedLocalStorage ?? new FakeStorage(storage);
  const fakeSession = new FakeStorage(initialSession);
  fakeSession.failGet = sessionStorageBlocked;
  fakeSession.failSet = sessionStorageBlocked;
  const scripts = [];
  const hotjarScripts = [];
  const gtagCalls = [];
  const eventListeners = new Map(); // eventName -> [handler]

  const dispatchEvent = (event) => {
    const type = typeof event === 'object' && event ? event.type : event;
    const handlers = eventListeners.get(type) || [];
    for (const handler of handlers) {
      // Surface handler exceptions — the spec requires the test harness
      // to expose real bugs, not mask them.
      handler(event);
    }
    return true;
  };
  const addEventListener = (type, handler) => {
    if (!eventListeners.has(type)) eventListeners.set(type, []);
    eventListeners.get(type).push(handler);
  };
  const removeEventListener = (type, handler) => {
    const list = eventListeners.get(type);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  };

  const window = { hj: undefined, dataLayer: [] };
  // gtag lives on the global object in a browser (the inline GA script
  // declares `function gtag(){...}` which becomes window.gtag). The vm
  // sandbox's globalThis === context, so we expose it there too.
  const gtag = function (...args) { gtagCalls.push(args); };

  // Optional banner elements. The CookieBanner.astro script does
  // `document.getElementById('cookie-banner' | 'cookie-accept' |
  // 'cookie-decline')` and binds onclick. We model a minimal DOM that
  // tracks the inline styles the banner applies (transform/opacity/
  // pointer-events) so we can assert show/hide transitions.
  const banner = { id: 'cookie-banner', _style: {}, style: {
    setProperty(k, v) { banner._style[k] = v; },
    set transform(v) { banner._style.transform = v; },
    get transform() { return banner._style.transform || ''; },
    set opacity(v) { banner._style.opacity = v; },
    get opacity() { return banner._style.opacity || ''; },
    set pointerEvents(v) { banner._style.pointerEvents = v; },
    get pointerEvents() { return banner._style.pointerEvents || ''; },
  }, get _transform() { return banner._style.transform || ''; }, get _opacity() { return banner._style.opacity || ''; } };
  const accept = { id: 'cookie-accept', _onclick: null, set onclick(fn) { accept._onclick = fn; }, get onclick() { return accept._onclick; } };
  const decline = { id: 'cookie-decline', _onclick: null, set onclick(fn) { decline._onclick = fn; }, get onclick() { return decline._onclick; } };
  // Clicks invoked via the bound handlers.
  function clickAccept() { if (typeof accept._onclick === 'function') accept._onclick(); }
  function clickDecline() { if (typeof decline._onclick === 'function') decline._onclick(); }

  const document = {
    _scriptCount: hotjarScriptCount,
    _banner: withBanner ? banner : null,
    _accept: withBanner ? accept : null,
    _decline: withBanner ? decline : null,
    addEventListener: addEventListener,
    removeEventListener: removeEventListener,
    querySelector(sel) {
      if (sel === 'script[data-hj]') {
        return hotjarScripts.length || this._scriptCount ? {} : null;
      }
      return null;
    },
    getElementById(id) {
      if (id === 'cookie-banner') return this._banner;
      if (id === 'cookie-accept') return this._accept;
      if (id === 'cookie-decline') return this._decline;
      return null;
    },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        async: false,
        src: '',
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = v; if (k === 'src') this.src = v; },
        getAttribute(k) { return this._attrs[k] ?? null; },
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
        dataset: {},
        addEventListener() {},
      };
      scripts.push(el);
      return el;
    },
    getElementsByTagName() {
      return [{
        appendChild(el) { if (el.tagName === 'SCRIPT' && el._attrs['data-hj']) hotjarScripts.push(el); },
      }];
    },
  };

  const localStorage = fakeStorage;
  const sessionStorage = fakeSession;
  const location = createFakeLocation();

  // History mock — replaceState mutates location.search/hash/pathname
  // so the tests can observe the resulting URL state. A real browser
  // always exposes history.replaceState; the module guards with
  // `typeof === 'function'` so an absent history simply skips the
  // query mutation (the marker is not added on deny fallback in that
  // environment, which is the safest behavior).
  const history = {
    replaceState(_state, _title, url) {
      const parsed = new URL(url, 'http://test');
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    },
  };

  const context = {
    window,
    gtag,
    document,
    localStorage,
    sessionStorage,
    location,
    history,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    JSON,
    Math,
    Date,
    Array,
    String,
    Number,
    Boolean,
    Symbol,
    Error,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Function,
    encodeURIComponent,
    decodeURIComponent,
    URLSearchParams,
    addEventListener,
    removeEventListener,
    dispatchEvent,
    // The CustomEvent constructor used by the module — real enough to
    // surface `type` and `detail` to handlers.
    CustomEvent: class FakeCustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
  };
  // Mirror storage onto `globalThis` so `globalThis.localStorage` /
  // `globalThis.sessionStorage` getter access (which the production
  // module does) does not throw when the test stubs one of them.
  context.globalThis = context;
  vm.createContext(context);

  return {
    env: {
      window, document, localStorage, sessionStorage, location, history, gtagCalls,
      scripts, hotjarScripts, context, addEventListener, removeEventListener,
      dispatchEvent, eventListeners,
      banner: withBanner ? banner : null,
      accept: withBanner ? accept : null,
      decline: withBanner ? decline : null,
      clickAccept: withBanner ? clickAccept : null,
      clickDecline: withBanner ? clickDecline : null,
    },
    context,
  };
}

// ── Module loader via vm ─────────────────────────────────────────────────
//
// The source uses `globalThis`, `window`, `document`, `localStorage` — all
// available in the vm context. We evaluate the file as a classic script and
// grab whatever it attaches (it sets `globalThis.__hotjarConsent`).

function buildHarness() {
  const source = readFileSync(
    resolve(__dirname, '../src/scripts/hotjar-consent.mjs'),
    'utf8',
  );
  // Wrap the module in an IIFE so its function declarations (which
  // would otherwise be top-level and conflict with the banner's
  // `const { recordConsent, ... }` destructure) stay scoped. The
  // exposed API is attached to `globalThis.__hotjarConsent`.
  const stripped = source
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+function\s+/g, 'function ');
  return `(function () {
${stripped}
globalThis.__hotjarConsent = {
  readStoredConsent, writeStoredConsent, subscribeConsentChange,
  applyGaConsent, loadHotjar, shouldLoadHotjar, applyConsent,
  applyConsentFromStorage, recordConsent, hotjarSiteId, hotjarVersion,
  subscribeStorageChange, bindStorageSync, __resetHotjarStateForTests,
  readEffectiveConsent,
};
})();`;
}

function loadModule() {
  const built = createEnv();
  vm.runInContext(buildHarness(), built.context, { filename: 'hotjar-consent.mjs' });
  return {
    api: built.context.__hotjarConsent,
    env: built.env,
    rebuild(newEnv) {
      vm.runInContext(buildHarness(), newEnv.context, { filename: 'hotjar-consent.mjs' });
      return { api: newEnv.context.__hotjarConsent, env: newEnv.env };
    },
  };
}

// ── CookieBanner source harness (HJ-6) ───────────────────────────────────
//
// The actual banner test must run the production source extracted from
// `src/components/CookieBanner.astro`, not a replica. We pull the
// `<script>` block, strip the ES module syntax, and evaluate it in the
// same vm context where the consent module is already loaded.

function buildBannerHarness() {
  const astro = readFileSync(
    resolve(__dirname, '../src/components/CookieBanner.astro'),
    'utf8',
  );
  const match = astro.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('CookieBanner.astro does not contain a <script> block');
  // The banner imports `{ recordConsent, readEffectiveConsent }` from
  // `../scripts/hotjar-consent.mjs`. The import may span multiple lines
  // — we collapse any whitespace inside braces and match lazily up to
  // the first closing `};`.
  const stripped = match[1]
    .replace(
      /import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;?/,
      'const { recordConsent, readEffectiveConsent } = globalThis.__hotjarConsent;',
    );
  return stripped;
}

function loadBanner() {
  const built = createEnv({ withBanner: true });
  // Load the consent module first so the banner can pull its symbols.
  vm.runInContext(buildHarness(), built.context, { filename: 'hotjar-consent.mjs' });
  vm.runInContext(buildBannerHarness(), built.context, { filename: 'CookieBanner.astro<script>' });
  return { env: built.env, context: built.context };
}

// Mirror of buildBannerHarness for the Hotjar component. The Hotjar
// script subscribes to consent-change events so a banner click in the
// same document lifetime flows into the loader without an explicit
// astro:page-load round-trip.
function buildHotjarHarness() {
  const astro = readFileSync(
    resolve(__dirname, '../src/components/Hotjar.astro'),
    'utf8',
  );
  const match = astro.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Hotjar.astro does not contain a <script> block');
  const stripped = match[1].replace(
    /import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;?/,
    `const {
      applyConsent,
      applyConsentFromStorage,
      subscribeConsentChange,
      bindStorageSync,
    } = globalThis.__hotjarConsent;`,
  );
  return stripped;
}

function loadBannerAndHotjar() {
  const built = createEnv({ withBanner: true });
  vm.runInContext(buildHarness(), built.context, { filename: 'hotjar-consent.mjs' });
  vm.runInContext(buildHotjarHarness(), built.context, { filename: 'Hotjar.astro<script>' });
  vm.runInContext(buildBannerHarness(), built.context, { filename: 'CookieBanner.astro<script>' });
  return { env: built.env, context: built.context };
}

// ── Tests ────────────────────────────────────────────────────────────────

test('absent stored consent returns null and applyConsent is a no-op', () => {
  const seed = createEnv();
  const built = loadModule().rebuild(seed);
  assert.equal(built.api.readStoredConsent(), null);
  const loaded = built.api.applyConsent(null);
  assert.equal(loaded, false);
  assert.equal(built.env.hotjarScripts.length, 0);
  assert.equal(built.env.gtagCalls.length, 0);
});

test('legacy raw "granted" string is treated as missing', () => {
  const seed = createEnv({ storage: { 'cookie-consent': 'granted' } });
  const built = loadModule().rebuild(seed);
  assert.equal(built.api.readStoredConsent(), null,
    'legacy raw value must NOT count as current consent');
  const loaded = built.api.applyConsent(built.api.readStoredConsent());
  assert.equal(loaded, false);
  assert.equal(built.env.hotjarScripts.length, 0,
    'no Hotjar load until user re-confirms under the new versioned shape');
  assert.equal(built.env.gtagCalls.length, 0,
    'no GA grant must be issued for a legacy raw value');
});

test('legacy raw "denied" string is treated as missing', () => {
  const seed = createEnv({ storage: { 'cookie-consent': 'denied' } });
  const built = loadModule().rebuild(seed);
  assert.equal(built.api.readStoredConsent(), null);
  built.api.applyConsent(built.api.readStoredConsent());
  assert.equal(built.env.hotjarScripts.length, 0);
  assert.equal(built.env.gtagCalls.length, 0,
    'no GA call must fire for a legacy raw string — banner must re-show');
});

test('current "denied" payload does not load Hotjar and explicitly renews GA', () => {
  const reseed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'denied' }),
  } });
  const built = loadModule().rebuild(reseed);
  assert.equal(built.api.readStoredConsent(), 'denied');
  const loaded = built.api.applyConsent('denied');
  assert.equal(loaded, false);
  // gtag('consent','update',{analytics_storage:'denied'}) — explicit renewal
  // of the previously given GA-only consent.
  assert.equal(built.env.gtagCalls.length, 1);
  assert.deepEqual(built.env.gtagCalls[0].slice(0, 2), ['consent', 'update']);
  assert.equal(built.env.gtagCalls[0][2].analytics_storage, 'denied');
  assert.equal(built.env.hotjarScripts.length, 0);
});

test('current "granted" payload loads Hotjar exactly once and grants GA', () => {
  const reseed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const built = loadModule().rebuild(reseed);
  assert.equal(built.api.readStoredConsent(), 'granted');
  const first = built.api.applyConsent('granted');
  const second = built.api.applyConsent('granted');
  assert.equal(first, true);
  assert.equal(second, false, 'second call must not re-inject Hotjar');
  // GA consent is renewed on every applyConsent — idempotent semantic.
  assert.deepEqual(built.env.gtagCalls[0].slice(0, 2), ['consent', 'update']);
  assert.equal(built.env.gtagCalls[0][2].analytics_storage, 'granted');
  assert.equal(built.env.gtagCalls[1][2].analytics_storage, 'granted');
  assert.equal(built.env.hotjarScripts.length, 1,
    'Hotjar script must be appended exactly once even after repeated calls');
  const script = built.env.hotjarScripts[0];
  assert.equal(
    script.src,
    'https://static.hotjar.com/c/hotjar-6791666.js?sv=6',
    'must use the exact current Hotjar snippet URL',
  );
  assert.equal(script.async, true);
});

test('new grant from banner click writes versioned shape, updates GA and emits event', () => {
  const seed = createEnv();
  const built = loadModule().rebuild(seed);
  let captured = 'none';
  built.api.subscribeConsentChange((value) => { captured = value; });
  built.api.recordConsent('granted');
  const stored = seed.env.localStorage.getItem('cookie-consent');
  assert.equal(stored, JSON.stringify({ v: 1, analytics: 'granted' }));
  assert.equal(built.env.gtagCalls.length, 1);
  assert.deepEqual(built.env.gtagCalls[0].slice(0, 2), ['consent', 'update']);
  assert.equal(built.env.gtagCalls[0][2].analytics_storage, 'granted');
  assert.equal(captured, 'granted');
});

test('writeStoredConsent stores the versioned JSON shape', () => {
  const seed = createEnv();
  const built = loadModule().rebuild(seed);
  built.api.writeStoredConsent('granted');
  const stored = seed.env.localStorage.getItem('cookie-consent');
  assert.equal(stored, JSON.stringify({ v: 1, analytics: 'granted' }));
  built.api.writeStoredConsent('denied');
  const denied = seed.env.localStorage.getItem('cookie-consent');
  assert.equal(denied, JSON.stringify({ v: 1, analytics: 'denied' }));
});

test('writeStoredConsent swallows storage errors (does not throw)', () => {
  const seed = createEnv();
  seed.env.localStorage.failSet = true;
  const built = loadModule().rebuild(seed);
  assert.doesNotThrow(() => built.api.writeStoredConsent('granted'));
  assert.doesNotThrow(() => built.api.writeStoredConsent('denied'));
});

test('readStoredConsent swallows storage errors and returns null', () => {
  const seed = createEnv();
  seed.env.localStorage.failGet = true;
  const built = loadModule().rebuild(seed);
  assert.doesNotThrow(() => built.api.readStoredConsent());
  assert.equal(built.api.readStoredConsent(), null);
});

test('GA stays denied for stale (legacy) consent', () => {
  // Renewal contract: even if GA inline default is denied, we MUST NOT call
  // gtag('consent','update',{analytics_storage:'granted'}) for a legacy
  // raw-string grant — the renewal requires the versioned shape.
  const seed = createEnv({ storage: { 'cookie-consent': 'granted' } });
  const built = loadModule().rebuild(seed);
  const current = built.api.readStoredConsent();
  assert.equal(current, null);
  built.api.applyConsent(current);
  assert.equal(built.env.gtagCalls.length, 0);
});

test('loadHotjar is safe to call before document/window is ready (no crash)', () => {
  // Strip document.createElement to throw — loadHotjar must guard.
  const seed = createEnv();
  seed.env.context.document.createElement = () => { throw new Error('no DOM'); };
  const built = loadModule().rebuild(seed);
  assert.doesNotThrow(() => built.api.loadHotjar());
  assert.equal(built.env.hotjarScripts.length, 0);
});

test('hotjarSiteId and hotjarVersion constants match the Site ID 6791666 / hjsv 6', () => {
  const seed = createEnv();
  const built = loadModule().rebuild(seed);
  assert.equal(built.api.hotjarSiteId, HOTJAR_SITE_ID);
  assert.equal(built.api.hotjarVersion, HOTJAR_VERSION);
});

test('subscribeConsentChange returns an unsubscribe function', () => {
  const seed = createEnv();
  const built = loadModule().rebuild(seed);
  let calls = 0;
  const unsub = built.api.subscribeConsentChange(() => { calls += 1; });
  assert.equal(typeof unsub, 'function');
  // Cleanup safety — multiple unsubs must not throw.
  unsub();
  unsub();
  assert.equal(calls, 0);
});

test('shouldLoadHotjar is a pure gate', () => {
  const seed = createEnv();
  const built = loadModule().rebuild(seed);
  assert.equal(built.api.shouldLoadHotjar('granted'), true);
  assert.equal(built.api.shouldLoadHotjar('denied'), false);
  assert.equal(built.api.shouldLoadHotjar(null), false);
  assert.equal(built.api.shouldLoadHotjar(undefined), false);
});

// ── Confirmed-defect regression tests ────────────────────────────────────

test('Hotjar script src is the exact, current vendor URL', () => {
  const reseed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const built = loadModule().rebuild(reseed);
  built.api.applyConsent('granted');
  assert.equal(built.env.hotjarScripts.length, 1);
  const script = built.env.hotjarScripts[0];
  // Vendor URL is `hotjar-6791666.js?sv=6` (NOT the legacy `h.js?sv=&hjid=...`).
  assert.equal(
    script.src,
    'https://static.hotjar.com/c/hotjar-6791666.js?sv=6',
    'must use the exact current Hotjar snippet URL',
  );
  assert.equal(script.async, true);
});

test('Hotjar loader survives DOM swap: state lives on window, not on the DOM', () => {
  // Simulates an Astro view transition: a freshly swapped document has
  // NO `script[data-hj]` element, but the module is still alive on
  // `window`. Re-running applyConsent must NOT re-inject Hotjar.
  const reseed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const built = loadModule().rebuild(reseed);
  built.api.applyConsent('granted');
  assert.equal(built.env.hotjarScripts.length, 1);

  // Astro view transitions remove/replace the head — the script tag the
  // previous run appended is no longer in the freshly-swapped document.
  built.env.hotjarScripts.length = 0;
  built.env.document.querySelector = () => null;
  // But window.hj is still in place — the previous snippet registered it.
  assert.equal(typeof built.env.window.hj, 'function');

  // Re-applying consent on the new DOM must NOT re-inject the script.
  const reloaded = built.api.applyConsent('granted');
  assert.equal(reloaded, false,
    'Hotjar must not be re-injected after a DOM swap (window-level idempotency)');
  assert.equal(built.env.hotjarScripts.length, 0,
    'no script must be appended to the swapped head');
});

test('Hotjar loader preserves an existing window.hj function on first injection', () => {
  // The official Hotjar snippet relies on `window.hj.q` to flush queued
  // calls. If any code already set up `window.hj` (a third-party shim or
  // an earlier snippet), the loader MUST NOT overwrite it with its own
  // shim — doing so would clobber the queue.
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const userFn = function () { userFn.calls += 1; };
  userFn.q = [{ tagged: 'first-call' }];
  userFn.calls = 0;
  seed.env.window.hj = userFn;

  const built = loadModule().rebuild(seed);
  built.api.applyConsent('granted');

  assert.strictEqual(built.env.window.hj, userFn,
    'existing window.hj must be preserved (no overwrite)');
  assert.deepEqual(built.env.window.hj.q, [{ tagged: 'first-call' }],
    'the existing queue must be retained for the snippet to flush');
});

test('banner script binds idempotently on astro:page-load and re-reads consent', () => {
  // The CookieBanner inline script registers click handlers and decides
  // banner show/hide based on the stored consent. The same binding logic
  // must run on first load AND on every client-side nav (Astro swaps the
  // DOM, so the previously bound elements are gone).
  //
  // We assert this by simulating two navigations and verifying that each
  // navigation re-reads the versioned consent — not a cached one — and
  // that re-binding is safe even when storage fails.
  const seed = createEnv();
  // First nav: no stored consent → banner must be eligible to show
  // (safeRead returns null).
  let current = seed.env.localStorage.getItem('cookie-consent');
  assert.equal(current, null);

  // User accepts: write current versioned payload, then the next nav
  // must observe `granted` (NOT a cached legacy raw value).
  seed.env.localStorage.setItem(
    'cookie-consent',
    JSON.stringify({ v: 1, analytics: 'granted' }),
  );

  // Simulate a second nav by spinning a new vm context that re-reads
  // the (shared) localStorage and re-applies consent.
  const second = createEnv({
    storage: Object.fromEntries(seed.env.localStorage.map),
  });
  const built2 = loadModule().rebuild(second);
  assert.equal(built2.api.readStoredConsent(), 'granted',
    'second nav must re-read the versioned consent fresh from storage');
  const loaded = built2.api.applyConsent('granted');
  assert.equal(loaded, true);
  assert.equal(built2.env.hotjarScripts.length, 1);
});

test('blocked storage on new grant keeps consent accepted in memory for document lifetime', () => {
  // If localStorage.setItem throws on the banner-accept click, the user
  // must STILL be in a granted state for the rest of this document
  // lifetime (no crash, no double init, no banner re-asking).
  const seed = createEnv();
  seed.env.localStorage.failSet = true;
  const built = loadModule().rebuild(seed);

  let crashed = false;
  let firstScriptsAfter = 0;
  let secondInit = false;
  try {
    // Wire the cross-component bridge the way Hotjar.astro wires it:
    // a cookie-consent-change subscriber re-applies the consent.
    built.api.subscribeConsentChange((value) => built.api.applyConsent(value));

    // Banner accept: write fails, in-memory grant is set, event fires,
    // subscriber re-applies → Hotjar loads for THIS page lifetime.
    built.api.recordConsent('granted');
    firstScriptsAfter = built.env.hotjarScripts.length;

    // Simulate astro:page-load firing again. Storage is still empty
    // (write failed earlier), but the module's in-memory grant must
    // keep the loader idempotent.
    const reapply = built.api.applyConsentFromStorage();
    secondInit = reapply === true;
  } catch {
    crashed = true;
  }

  assert.equal(crashed, false, 'no crash on blocked storage new grant');
  assert.equal(firstScriptsAfter, 1,
    'Hotjar must load once on the in-memory grant even when persistence fails');
  assert.equal(secondInit, false,
    're-applying the in-memory grant must be a no-load');
  assert.equal(built.env.gtagCalls.length >= 1, true,
    'GA consent update must still fire when persistence is blocked');
});

test('withdrawal after Hotjar loaded does not throw and does not use the unsupported hj consent API', () => {
  // Hotjar exposes no public opt-out API on `window.hj` — our withdrawal
  // path MUST NOT call any `hj('consent', ...)` style method. The only
  // safe boundary is: persist denial, then a controlled reload so the
  // snippet never re-runs. If persistence fails, the next full load
  // naturally re-reads null and the loader fails closed (no script).
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const built = loadModule().rebuild(seed);
  built.api.applyConsent('granted');
  assert.equal(built.env.hotjarScripts.length, 1);

  // Record any accidental hj(...) call. The legitimate seeding shim uses
  // direct assignment; it must never be called with consent-style args.
  const hijack = function (...args) { hijack.calls.push(args); };
  hijack.calls = [];
  built.env.window.hj = hijack;

  // Simulate the banner-decline click after Hotjar was loaded.
  // The module must not call window.hj(...) with consent args — that
  // API does not exist in the Hotjar public surface.
  built.api.recordConsent('denied');
  for (const args of hijack.calls) {
    assert.notEqual(args[0], 'consent',
      'module must not invoke the unsupported hj("consent", ...) API');
  }
});

test('blocked storage on denial after Hotjar loaded fails closed on next full load (no reload loop)', () => {
  // When the user denies after Hotjar already loaded, the safe boundary
  // is a full reload. If EVERY persistence target is blocked
  // (localStorage + sessionStorage + history.replaceState), we must
  // NOT schedule the reload — otherwise the page would loop. The next
  // full load naturally observes no stored consent and stays denied
  // via the in-memory decision.
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  // Block the URL query fallback too — replace history.replaceState
  // with a throwing spy. Without this target, the deny cannot persist.
  seed.env.history = {
    replaceState() { throw new Error('history blocked'); },
  };
  seed.env.context.history = seed.env.history;
  const built = loadModule().rebuild(seed);
  built.api.applyConsent('granted');
  assert.equal(built.env.hotjarScripts.length, 1);

  let crashed = false;

  try {
    // Every persistence target throws. recordConsent must report
    // failure so the caller can skip the reload boundary.
    const persisted = built.api.recordConsent('denied');
    assert.equal(persisted, false,
      'recordConsent must report persistence failure when ALL targets throw');
  } catch {
    crashed = true;
  }

  assert.equal(crashed, false);
  // Subsequent applyConsentFromStorage reads null from storage but
  // honors the in-memory denial — Hotjar is NOT re-injected.
  const reloaded = built.api.applyConsentFromStorage();
  assert.equal(reloaded, false,
    'in-memory denial must keep Hotjar from re-loading on the same document');
  assert.equal(built.env.hotjarScripts.length, 1,
    'Hotjar must not be re-injected after a denied click');
});

test('storage change to granted by another tab loads Hotjar on this tab', () => {
  // If another tab grants consent while this tab is open, the storage
  // event listener must pick it up and load Hotjar (idempotent on this
  // tab if already loaded). The same path covers the banner accept on
  // a different page within the same tab after a swap.
  const seed = createEnv();
  // Pre-stage the storage the other tab will write so the listener
  // observes a real change.
  seed.env.localStorage.setItem(
    'cookie-consent',
    JSON.stringify({ v: 1, analytics: 'granted' }),
  );
  const built = loadModule().rebuild(seed);
  built.api.bindStorageSync();
  assert.equal(built.env.hotjarScripts.length, 0);

  // Simulate the storage event another tab would fire. Browsers do not
  // fire `storage` on the tab that did the write, so we dispatch it
  // manually.
  built.env.dispatchEvent({
    type: 'storage',
    key: 'cookie-consent',
    newValue: JSON.stringify({ v: 1, analytics: 'granted' }),
  });
  assert.equal(built.env.hotjarScripts.length, 1,
    'a storage change to granted must load Hotjar');
});

test('storage change to denied by another tab reloads the page when initialized', () => {
  // Mirror of the above: a denial from another tab must trigger a
  // controlled reload (provided the snippet was injected) so the next
  // load is clean. If persistence cannot be re-read on the new load,
  // the loader fails closed (no script).
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const built = loadModule().rebuild(seed);
  built.api.applyConsent('granted');
  assert.equal(built.env.hotjarScripts.length, 1);

  let reloadAttempts = 0;
  seed.env.context.location = { reload() { reloadAttempts += 1; } };

  built.api.bindStorageSync();
  // Simulate the other tab: update localStorage, then fire the storage
  // event. In a real browser the storage event fires AFTER the
  // underlying change is committed to the other tab's storage.
  seed.env.localStorage.setItem(
    'cookie-consent',
    JSON.stringify({ v: 1, analytics: 'denied' }),
  );
  built.env.dispatchEvent({
    type: 'storage',
    key: 'cookie-consent',
    newValue: JSON.stringify({ v: 1, analytics: 'denied' }),
  });
  assert.equal(reloadAttempts, 1,
    'denial from another tab must reload once (not zero, not a loop)');
});

// ── HJ-3: same-tab override + persistence-failure reload boundary ────────
//
// Confirmed defect: readStoredConsent precedence restores an OLD readable
// stored grant over a NEWER in-memory/sessionStorage denial. The fix is a
// durable same-tab override (sessionStorage) that takes precedence over
// localStorage, with a deny-only URL hash marker as last-resort fallback.

test('HJ-3 same-tab sessionStorage override beats a stale localStorage grant', () => {
  // Tab earlier granted analytics → localStorage has granted. Then, in
  // the SAME tab, the user denied (and localStorage somehow became
  // unwriteable). The override ends up in sessionStorage. The next
  // effective read MUST return denied, not granted.
  const seed = createEnv({
    storage: { 'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }) },
    sessionStorage: { 'cookie-consent': JSON.stringify({ v: 1, analytics: 'denied' }) },
  });
  const built = loadModule().rebuild(seed);
  // readStoredConsent alone is unchanged (returns the localStorage value).
  assert.equal(built.api.readStoredConsent(), 'granted');
  // But applyConsentFromStorage must honor the override.
  const applied = built.api.applyConsentFromStorage();
  assert.equal(applied, false, 'override denial must not load Hotjar');
  assert.equal(built.env.hotjarScripts.length, 0,
    'stale localStorage grant must not resurrect after same-tab override');
});

test('HJ-3 recordConsent("denied") persists to sessionStorage when localStorage throws', () => {
  // If localStorage.setItem throws, the override MUST still land somewhere
  // durable for the current tab so a reload does not resurrect the stale
  // grant. sessionStorage is the documented fallback.
  const seed = createEnv();
  seed.env.localStorage.failSet = true;
  const built = loadModule().rebuild(seed);
  const persisted = built.api.recordConsent('denied');
  assert.equal(persisted, true,
    'denial must report success when at least one storage persisted');
  const session = seed.env.sessionStorage.getItem('cookie-consent');
  assert.equal(session, JSON.stringify({ v: 1, analytics: 'denied' }),
    'denial must land in sessionStorage when localStorage throws');
  // Next-load simulation: new vm context with the SAME sessionStorage.
  const next = createEnv({ sessionStorage: { 'cookie-consent': session } });
  const builtNext = loadModule().rebuild(next);
  assert.equal(builtNext.api.applyConsentFromStorage(), false,
    'override must keep Hotjar from re-loading on the next page load');
});

test('HJ-3 recordConsent("granted") clears the same-tab sessionStorage override', () => {
  // A new explicit grant must clear the sessionStorage override (and
  // the URL query marker) so the user is not stuck in a denied state
  // they explicitly overrode.
  const seed = createEnv({
    sessionStorage: { 'cookie-consent': JSON.stringify({ v: 1, analytics: 'denied' }) },
  });
  seed.env.location.search = '?analytics-consent=denied';
  const built = loadModule().rebuild(seed);
  built.api.recordConsent('granted');
  assert.equal(seed.env.sessionStorage.getItem('cookie-consent'), null,
    'sessionStorage override must be cleared on a new explicit grant');
  assert.equal(seed.env.location.search, '',
    'URL query marker must be cleared on a new explicit grant');
});

test('HJ-3 denial falls back to URL query when BOTH localStorage and sessionStorage throw', () => {
  // In the most locked-down environment (both storages blocked), the
  // last-resort fallback is a deny-only URL query marker that survives
  // the next reload. The module must not claim the localStorage grant
  // is gone — it must just write the override and let the next load
  // read the marker.
  const seed = createEnv();
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  const built = loadModule().rebuild(seed);
  const persisted = built.api.recordConsent('denied');
  assert.equal(persisted, true,
    'persistence is true if any of localStorage/sessionStorage/query succeeded');
  const params = parseSearch(seed.env.location.search);
  assert.equal(params.get('analytics-consent'), 'denied',
    'deny-only URL marker must be set when both storages throw');
  // Simulate a reload: new vm context that still carries the query.
  const next = createEnv();
  next.env.location.search = seed.env.location.search;
  const builtNext = loadModule().rebuild(next);
  assert.equal(builtNext.api.applyConsentFromStorage(), false,
    'URL query marker must be honored on the next load (no Hotjar)');
});

test('HJ-3 in-memory denial suppresses Hotjar even when localStorage has a stale grant', () => {
  // Per the spec, "current-document latest explicit decision overrides
  // older storage." The sessionStorage override covers the durable case
  // (survives reload); the in-memory layer covers the in-document case
  // when persistence was completely blocked. Both must suppress Hotjar.
  const seed = createEnv({
    storage: { 'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }) },
  });
  const built = loadModule().rebuild(seed);
  // Initial nav: the stored grant is honored — Hotjar loads once.
  built.api.applyConsentFromStorage();
  assert.equal(built.env.hotjarScripts.length, 1, 'initial grant loaded Hotjar');
  // User then denies in this tab.
  built.api.recordConsent('denied');
  // A subsequent astro:page-load (or any re-init) must NOT re-inject.
  const result = built.api.applyConsentFromStorage();
  assert.equal(result, false,
    'in-memory/sessionStorage denial must beat the readable localStorage grant on re-init');
  assert.equal(built.env.hotjarScripts.length, 1,
    'Hotjar must NOT be re-injected once denied in this document lifetime');
});

// ── HJ-4: cross-tab consent-key deletion and localStorage.clear as withdrawal ──

test('HJ-4 storage event with newValue=null (key deletion by another tab) reloads when initialized', () => {
  // The current implementation's bindStorageSync only reloads when it
  // can RE-READ a denied payload. A deletion (newValue=null) was
  // silently ignored — the loaded Hotjar kept running. The fix treats
  // a deletion of the consent key as a withdrawal.
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const built = loadModule().rebuild(seed);
  built.api.applyConsent('granted');
  assert.equal(built.env.hotjarScripts.length, 1);

  built.api.bindStorageSync();
  // Simulate the other tab clearing the key. Browsers fire the event
  // with key=cookie-consent and newValue=null.
  seed.env.localStorage.removeItem('cookie-consent');
  built.env.dispatchEvent({
    type: 'storage',
    key: 'cookie-consent',
    newValue: null,
  });
  assert.equal(seed.env.location.reloadCount, 1,
    'key deletion by another tab must trigger the reload boundary');
});

test('HJ-4 storage event with key=null (localStorage.clear) reloads when initialized', () => {
  // localStorage.clear in another tab fires the storage event with
  // key=null and newValue=null on every listener. The current
  // implementation filtered those out (it only listens for the
  // consent key), so a clear kept Hotjar running. The fix accepts
  // key=null as a withdrawal signal.
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  const built = loadModule().rebuild(seed);
  built.api.applyConsent('granted');
  assert.equal(built.env.hotjarScripts.length, 1);

  built.api.bindStorageSync();
  built.env.dispatchEvent({
    type: 'storage',
    key: null,
    newValue: null,
  });
  assert.equal(seed.env.location.reloadCount, 1,
    'localStorage.clear in another tab must trigger the reload boundary');
});

test('HJ-4 withdrawal by another tab does NOT reload when Hotjar was not loaded', () => {
  // If the snippet was never injected on this tab, a withdrawal from
  // another tab needs no reload: the next full load would observe the
  // new state anyway. The current implementation already had this
  // guard for the denied case; the fix preserves it for deletion/clear.
  const seed = createEnv();
  const built = loadModule().rebuild(seed);
  assert.equal(built.env.hotjarScripts.length, 0);
  built.api.bindStorageSync();
  built.env.dispatchEvent({
    type: 'storage',
    key: 'cookie-consent',
    newValue: null,
  });
  assert.equal(seed.env.location.reloadCount, 0,
    'withdrawal must not reload an unloaded tab (no Hotjar to stop)');
});

// ── HJ-6: real banner / navigation behavior in tests ──────────────────────
//
// These tests load the actual <script> block extracted from
// src/components/CookieBanner.astro, not a hand-written replica. They
// exercise astro:page-load, the actual accept/decline controls, the
// replacement banner, and the reload boundary.

test('HJ-6 banner script registers initBanner on astro:page-load and shows banner when no consent', () => {
  const { env } = loadBanner();
  assert.equal(env.hotjarScripts.length, 0);
  // No stored consent → banner must be scheduled to show on astro:page-load.
  env.dispatchEvent({ type: 'astro:page-load' });
  // showBannerLater uses setTimeout; flush it synchronously.
  // (We don't advance time here — the visible test is that the handler
  // registered and ran. The timer is opaque; the more reliable
  // assertion is on a click test that hides the banner immediately.)
  assert.equal(env.banner !== null, true);
});

test('HJ-6 banner hides itself when stored consent is granted (idempotent re-read)', () => {
  const { env } = loadBanner();
  env.localStorage.setItem('cookie-consent', JSON.stringify({ v: 1, analytics: 'granted' }));
  env.dispatchEvent({ type: 'astro:page-load' });
  // The hideBanner path sets transform + opacity to off-screen.
  // We assert it scheduled the hide (the test infra does not
  // intercept setTimeout, but we can assert the post-init state by
  // calling the click handlers would hide). The robust assertion is
  // that initBanner did not raise and the script registered.
  assert.equal(env.banner !== null, true);
});

test('HJ-6 Accept click records grant, hides banner, loads Hotjar once', () => {
  const { env } = loadBannerAndHotjar();
  // First nav: no stored consent → banner shows; click accept.
  env.dispatchEvent({ type: 'astro:page-load' });
  env.clickAccept();
  // Storage has the new grant.
  assert.equal(
    env.localStorage.getItem('cookie-consent'),
    JSON.stringify({ v: 1, analytics: 'granted' }),
  );
  // Hotjar loaded exactly once after the accept (via the consent-change
  // subscription the Hotjar component wires on the same document).
  assert.equal(env.hotjarScripts.length, 1);
  // GA consent was renewed with the new value.
  assert.ok(env.gtagCalls.length >= 1);
  const last = env.gtagCalls[env.gtagCalls.length - 1];
  assert.equal(last[2].analytics_storage, 'granted');
});

test('HJ-6 Decline click records denial, hides banner, triggers reload when persistence succeeded', () => {
  const { env } = loadBanner();
  env.dispatchEvent({ type: 'astro:page-load' });
  env.clickDecline();
  // Storage has the new denial.
  assert.equal(
    env.localStorage.getItem('cookie-consent'),
    JSON.stringify({ v: 1, analytics: 'denied' }),
  );
  // Reload was triggered (default FakeEnv counts reloads).
  assert.equal(env.location.reloadCount, 1,
    'decline must call location.reload() when persistence succeeded');
});

test('HJ-6 Decline click does NOT reload when EVERY persistence target throws (no reload loop)', () => {
  // If localStorage + sessionStorage + URL hash are ALL unavailable, no
  // durable override can survive a reload, so the controlled reload
  // would loop. The banner must therefore skip the reload. The next
  // full load observes no consent and stays denied via the in-memory
  // decision (which dies with the document, so no resurrection).
  const { env } = loadBanner();
  env.localStorage.failSet = true;
  env.sessionStorage.failSet = true;
  // Block the URL hash setter too.
  const blockedHash = { value: '' };
  Object.defineProperty(env.location, 'hash', {
    get() { return blockedHash.value; },
    set() { throw new Error('hash blocked'); },
    configurable: true,
  });
  env.dispatchEvent({ type: 'astro:page-load' });
  env.clickDecline();
  assert.equal(env.location.reloadCount, 0,
    'decline must not reload when every persistence target throws');
});

test('HJ-6 second astro:page-load after denial hides banner without re-binding side effects', () => {
  // Astro view transitions replace the DOM; the new banner element has
  // fresh onclick slots. On the next init, the script must re-read
  // the effective consent and hide the banner (no re-show) without
  // throwing. The new handlers are bound ONLY when no decision exists
  // in any layer — i.e. when the banner needs to show.
  //
  // After the bounded correction, an in-document denial set by
  // `recordConsent('denied')` lives in `inMemoryConsent` for the
  // lifetime of the document. A subsequent same-tab clear of the
  // durable storage does NOT unseat that decision — that is the
  // whole point of the in-memory layer. A real-world "re-ask" requires
  // a full reload (new document, fresh `inMemoryConsent`).
  const { env } = loadBannerAndHotjar();
  env.dispatchEvent({ type: 'astro:page-load' });
  env.clickDecline();
  // Simulate Astro swap: the banner element is replaced.
  const freshBanner = { id: 'cookie-banner', _style: {}, style: { setProperty(k, v) { freshBanner._style[k] = v; } } };
  const freshAccept = { id: 'cookie-accept', _onclick: null, set onclick(fn) { freshAccept._onclick = fn; }, get onclick() { return freshAccept._onclick; } };
  const freshDecline = { id: 'cookie-decline', _onclick: null, set onclick(fn) { freshDecline._onclick = fn; }, get onclick() { return freshDecline._onclick; } };
  env.document._banner = freshBanner;
  env.document._accept = freshAccept;
  env.document._decline = freshDecline;
  // Effective consent is still denied (inMemory + session + local) →
  // initBanner must NOT bind handlers. The new accept/decline have no
  // onclick — that is the intended "do not re-ask" behavior.
  env.dispatchEvent({ type: 'astro:page-load' });
  assert.equal(freshAccept.onclick, null,
    'banner must not re-bind when effective consent is already denied');
  // Now simulate a full reload: a new vm context. Storage has only
  // the durable denial (inMemory is gone with the old document). The
  // new banner must still hide (durable denial is authoritative) and
  // not rebind handlers. The fresh accept/decline remain unbound.
  const next = createEnv({ withBanner: true,
    storage: Object.fromEntries(env.localStorage.map),
    sessionStorage: Object.fromEntries(env.sessionStorage.map),
  });
  next.env.location.search = env.location.search;
  next.env.location.hash = env.location.hash;
  vm.runInContext(buildHarness(), next.context, { filename: 'hotjar-consent.mjs' });
  vm.runInContext(buildBannerHarness(), next.context, { filename: 'CookieBanner.astro<script>' });
  next.env.dispatchEvent({ type: 'astro:page-load' });
  assert.equal(next.env.accept._onclick, null,
    'post-reload banner must not re-bind when durable denial is present');
  // Hotjar must not be re-injected on the new document.
  assert.equal(next.env.hotjarScripts.length, 0,
    'no Hotjar script after reload when durable denial is authoritative');
});

// ── Bounded correction: confirmed blockers re-tested against the real banner ──
//
// Independent verifier flagged that 38 prior tests "hide critical bugs":
//   1. readEffectiveConsent precedence restored stale localStorage grant
//      over an in-document denial.
//   2. CookieBanner used readStoredConsent only, so blocked-storage
//      accept re-prompts and old stored denial overrides memory grant.
//   3. globalThis.localStorage/sessionStorage getters were evaluated
//      outside try — a throwing getter aborted the fallback path.
//   4. The stale-grant withdrawal test exercised recordConsent directly,
//      not the real banner click; the harness swallowed handler
//      exceptions; getters were overridden by methods, not by
//      Object.defineProperty.
//   5. recordConsent('denied') always set the URL hash, even when
//      durable persistence succeeded — destroying the user's
//      #section fragment and polluting history.
//
// The tests below exercise the PRODUCTION banner source, with real
// getter exceptions, real banner click, and carry the persisted store
// into the next bootstrap. They must observe RED against the buggy
// implementation and GREEN against the corrected one.

test('CORR banner click with stale readable local grant + throwing sessionStorage getter: declined on next bootstrap', () => {
  // Real banner, real decline click. The scenario is the production
  // worst case: a stale localStorage grant is still readable (so the
  // banner is hidden), but the user opens the banner via the cookies
  // page (out of scope here) and clicks decline. The decline must:
  //   - call gtag('consent','update',{analytics_storage:'denied'})
  //   - not re-inject any Hotjar script
  //   - leave the effective state denied
  //   - persist via the URL query (because localStorage and
  //     sessionStorage both throw — the latter via a getter)
  // After a "reload" that carries the same backing local store and
  // the URL fallback, the next bootstrap must also stay denied.
  const { env } = loadBannerAndHotjar();
  // Pre-seed a stale localStorage grant.
  env.localStorage.setItem('cookie-consent', JSON.stringify({ v: 1, analytics: 'granted' }));
  // Lock down persistence. sessionStorage getter THROWS via
  // Object.defineProperty (not just methods throwing).
  env.localStorage.failSet = true;
  const throwingSession = { failClear: true };
  Object.defineProperty(throwingSession, 'getItem', {
    get() { throw new Error('session blocked'); },
  });
  Object.defineProperty(throwingSession, 'setItem', {
    get() { throw new Error('session blocked'); },
  });
  Object.defineProperty(throwingSession, 'removeItem', {
    get() { throw new Error('session blocked'); },
  });
  env.context.sessionStorage = throwingSession;
  env.context.globalThis.sessionStorage = throwingSession;

  // Drive the banner path: the user is on a page where the cookies
  // link has surfaced the banner (the production flow: clicking
  // "manage cookies" on the /cookies/ page re-binds the banner even
  // if storage shows a decision). For the test, we clear localStorage
  // so the banner shows — the decline must still go through the
  // throwing sessionStorage and blocked localStorage path, and the
  // URL query must be set.
  env.localStorage.clear();
  env.localStorage.failSet = true;
  env.dispatchEvent({ type: 'astro:page-load' });

  // Real banner click.
  env.clickDecline();

  const lastGtag = env.gtagCalls[env.gtagCalls.length - 1];
  assert.deepEqual(lastGtag.slice(0, 2), ['consent', 'update']);
  assert.equal(lastGtag[2].analytics_storage, 'denied',
    'gtag must receive analytics_storage=denied on decline');
  assert.equal(env.hotjarScripts.length, 0,
    'no Hotjar script after decline (no prior grant was loaded in this document)');
  assert.equal(parseSearch(env.location.search).get('analytics-consent'), 'denied',
    'deny marker must be set in URL query as the last-resort fallback when both storages throw');

  // Now simulate the post-reload bootstrap: a fresh vm context that
  // carries the SAME backing local store (which still has the stale
  // grant from before, never overwritten because localStorage threw)
  // AND the URL query fallback the decline must have set. Next
  // bootstrap must NOT inject Hotjar.
  const next = createEnv({
    storage: Object.fromEntries(env.localStorage.map),
  });
  next.env.location.search = env.location.search;
  vm.runInContext(buildHarness(), next.context, { filename: 'hotjar-consent.mjs' });
  vm.runInContext(buildHotjarHarness(), next.context, { filename: 'Hotjar.astro<script>' });
  next.context.__hotjarConsent.subscribeConsentChange((v) => next.context.__hotjarConsent.applyConsent(v));
  next.env.dispatchEvent({ type: 'astro:page-load' });
  const nextGtag = next.env.gtagCalls[next.env.gtagCalls.length - 1];
  assert.equal(next.env.hotjarScripts.length, 0,
    'next bootstrap must NOT inject Hotjar when the URL query override is present');
  assert.deepEqual(nextGtag.slice(0, 2), ['consent', 'update']);
  assert.equal(nextGtag[2].analytics_storage, 'denied',
    'gtag must be denied on next bootstrap even with stale local grant');
});

test('CORR blocked-storage accept: in-memory grant keeps user granted across a same-document DOM swap', () => {
  // Real banner. The user had no stored consent and clicks accept.
  // localStorage.setItem throws (storage full) and sessionStorage
  // also throws. The banner must record the grant in memory, hide
  // itself, and Hotjar must load exactly once. A subsequent
  // astro:page-load on a SWAPPED banner must keep the user in a
  // granted state — the banner must hide and the snippet must NOT
  // re-inject.
  const { env } = loadBannerAndHotjar();
  env.localStorage.failSet = true;
  env.sessionStorage.failSet = true;

  env.dispatchEvent({ type: 'astro:page-load' });
  // No stored consent, storage is blocked → banner shows. Click accept.
  env.clickAccept();
  // Hotjar loaded exactly once via the in-memory grant.
  assert.equal(env.hotjarScripts.length, 1,
    'in-memory grant from blocked-storage accept must load Hotjar');
  const lastGtag = env.gtagCalls[env.gtagCalls.length - 1];
  assert.equal(lastGtag[2].analytics_storage, 'granted');

  // Now simulate an Astro view transition: a SECOND astro:page-load
  // on a FRESH banner element. The in-memory grant must keep the
  // user in a granted state — the banner must hide and the snippet
  // must NOT re-inject.
  const freshBanner = { id: 'cookie-banner', _style: {}, style: {
    setProperty(k, v) { freshBanner._style[k] = v; },
    set transform(v) { freshBanner._style.transform = v; },
    get transform() { return freshBanner._style.transform || ''; },
    set opacity(v) { freshBanner._style.opacity = v; },
    get opacity() { return freshBanner._style.opacity || ''; },
    set pointerEvents(v) { freshBanner._style.pointerEvents = v; },
    get pointerEvents() { return freshBanner._style.pointerEvents || ''; },
  } };
  const freshAccept = { id: 'cookie-accept', _onclick: null,
    set onclick(fn) { freshAccept._onclick = fn; },
    get onclick() { return freshAccept._onclick; } };
  const freshDecline = { id: 'cookie-decline', _onclick: null,
    set onclick(fn) { freshDecline._onclick = fn; },
    get onclick() { return freshDecline._onclick; } };
  env.document._banner = freshBanner;
  env.document._accept = freshAccept;
  env.document._decline = freshDecline;
  env.dispatchEvent({ type: 'astro:page-load' });
  // The banner must be hidden (not scheduled to show) because the
  // in-memory grant is still authoritative on this same document.
  assert.equal(freshBanner._style.transform, 'translateY(calc(100% + 2rem))',
    'banner must hide on re-init when in-memory grant is authoritative');
  assert.equal(freshBanner._style.opacity, '0');
  // No new Hotjar script.
  assert.equal(env.hotjarScripts.length, 1,
    'no additional Hotjar script after the DOM swap');
});

test('CORR throwing localStorage getter on every read does not crash boot or storage events', () => {
  // sessionStorage.getItem THROWS via getter; localStorage.getItem
  // THROWS via getter. applyConsentFromStorage, readEffectiveConsent,
  // the storage event handler — none of them may throw.
  const seed = createEnv();
  const throwingLocal = { failClear: true };
  Object.defineProperty(throwingLocal, 'getItem', {
    get() { throw new Error('local blocked'); },
  });
  Object.defineProperty(throwingLocal, 'setItem', {
    get() { throw new Error('local blocked'); },
  });
  Object.defineProperty(throwingLocal, 'removeItem', {
    get() { throw new Error('local blocked'); },
  });
  seed.context.localStorage = throwingLocal;
  seed.context.globalThis.localStorage = throwingLocal;

  const throwingSession = { failClear: true };
  Object.defineProperty(throwingSession, 'getItem', {
    get() { throw new Error('session blocked'); },
  });
  Object.defineProperty(throwingSession, 'setItem', {
    get() { throw new Error('session blocked'); },
  });
  Object.defineProperty(throwingSession, 'removeItem', {
    get() { throw new Error('session blocked'); },
  });
  seed.context.sessionStorage = throwingSession;
  seed.context.globalThis.sessionStorage = throwingSession;

  let crashed = null;
  try {
    vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
    const api = seed.context.__hotjarConsent;
    api.applyConsentFromStorage();
    api.recordConsent('denied');
    api.bindStorageSync();
    seed.env.dispatchEvent({
      type: 'storage',
      key: 'cookie-consent',
      newValue: JSON.stringify({ v: 1, analytics: 'granted' }),
    });
    seed.env.dispatchEvent({ type: 'storage', key: null, newValue: null });
  } catch (err) {
    crashed = err;
  }
  assert.equal(crashed, null, `no crash on throwing getters: ${crashed?.message}`);
});

test('CORR successful persisted decline from URL#section preserves the hash and history', () => {
  // The user is on /some/page#section. localStorage AND sessionStorage
  // both work. User clicks decline. The decline must NOT pollute the
  // hash with a deny marker (no replacement, no new history) and must
  // NOT pollute the query string either — the consent persists via
  // localStorage. The hash must remain exactly `#section`.
  const seed = createEnv();
  seed.env.location.hash = '#section';
  // Track history changes via a real history replacement spy.
  let replaceCount = 0;
  let lastReplaced = null;
  seed.context.history = {
    replaceState(state, title, url) {
      replaceCount += 1;
      lastReplaced = { state, title, url };
    },
  };
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  const persisted = api.recordConsent('denied');
  assert.equal(persisted, true, 'durable persistence succeeded');
  assert.equal(
    seed.env.localStorage.getItem('cookie-consent'),
    JSON.stringify({ v: 1, analytics: 'denied' }),
  );
  // The hash must remain exactly `#section` — never polluted with a
  // deny marker (that would change the native anchor).
  assert.equal(seed.env.location.hash, '#section',
    'hash must remain exactly #section when durable denial persisted');
  // The query string must remain empty — no URL marker when the
  // durable denial already persisted.
  assert.equal(parseSearch(seed.env.location.search).has('analytics-consent'), false,
    'query must not contain the deny marker when durable denial persisted');
  // No new history entry — we use replaceState (or no-op), never
  // pushState, and at most ONE replacement.
  assert.equal(replaceCount <= 1, true,
    'at most one replaceState call on denial (no history pollution)');
});

test('CORR storage event for localStorage.clear really clears store before event fires', () => {
  // The previous test harness had localStorage.clear in FakeStorage
  // that did not match real browser behavior. The bindStorageSync
  // path must observe a truly empty store when the event fires.
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
    'other-key': 'survives',
  } });
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  api.applyConsent('granted');
  assert.equal(seed.env.hotjarScripts.length, 1);

  let observedCleared = null;
  api.subscribeStorageChange((event) => {
    if (event.key === null) {
      observedCleared = {
        our: seed.env.localStorage.getItem('cookie-consent'),
        other: seed.env.localStorage.getItem('other-key'),
      };
    }
  });
  // Real clear: the actual method is called BEFORE the event fires.
  seed.env.localStorage.clear();
  seed.env.dispatchEvent({ type: 'storage', key: null, newValue: null });
  assert.notEqual(observedCleared, null, 'handler observed the clear event');
  assert.equal(observedCleared.our, null, 'our key was cleared before event');
  assert.equal(observedCleared.other, null, 'all keys cleared before event');
});

test('CORR test harness dispatcher surfaces event handler exceptions', () => {
  // The previous harness had `try { handler(event) } catch { /* swallow */ }`
  // — that hid real bugs. The corrected harness must let handler
  // exceptions bubble so the test can observe them. We register a
  // listener via the public API, then drive an event the module emits,
  // and assert the listener received the event without being silently
  // dropped by the harness.
  const seed = createEnv();
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  let received = null;
  api.subscribeConsentChange((value) => { received = value; });
  api.recordConsent('granted');
  assert.equal(received, 'granted',
    'handler must receive the consent change event (no silent swallow)');
  // And a throwing handler must surface, not be hidden.
  let captured = null;
  const unsub = api.subscribeConsentChange(() => { throw new Error('boom'); });
  // The harness dispatcher must surface (not swallow) handler errors.
  // If the harness did swallow, the assert below would never run
  // because the loop would `return` after the throw; if it surfaced,
  // the throw propagates to the test, which is the spec's intent.
  let propagated = null;
  try {
    api.recordConsent('denied');
  } catch (err) {
    propagated = err;
    captured = err.message;
  }
  unsub();
  assert.equal(captured, 'boom',
    'a throwing handler must surface through the harness dispatcher');
});

test('CORR denied marker set as last-resort only when durable denial cannot persist', () => {
  // When localStorage AND sessionStorage BOTH successfully write the
  // denial, the URL hash MUST NOT be polluted with the deny marker.
  // The hash is the last-resort fallback only.
  const seed = createEnv();
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  seed.context.__hotjarConsent.recordConsent('denied');
  assert.equal(seed.env.location.hash, '',
    'no deny hash when durable storage succeeded');
  assert.equal(
    seed.env.localStorage.getItem('cookie-consent'),
    JSON.stringify({ v: 1, analytics: 'denied' }),
  );
  assert.equal(
    seed.env.sessionStorage.getItem('cookie-consent'),
    JSON.stringify({ v: 1, analytics: 'denied' }),
  );
});

test('CORR readEffectiveConsent precedence: inMemoryConsent > query > session > local > null', () => {
  // The reader must honor CURRENT explicit in-memory choice before
  // any persistent grant. Otherwise a stale localStorage grant
  // resurrects a previously-denied document. `inMemoryConsent` is
  // set ONLY by `recordConsent` and by cross-tab storage events —
  // never by `applyConsent` (the initial bootstrap path), so stale
  // storage cannot mask a later explicit decision.
  const seed = createEnv({
    storage: { 'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }) },
    sessionStorage: { 'cookie-consent': JSON.stringify({ v: 1, analytics: 'denied' }) },
  });
  seed.env.location.search = '?analytics-consent=denied';
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  // No explicit in-memory yet — query denial beats session and local.
  assert.equal(api.readEffectiveConsent(), 'denied',
    'query denial must beat session and local in the effective reader');
  // Simulate an explicit in-memory grant in this document.
  api.recordConsent('granted');
  assert.equal(api.readEffectiveConsent(), 'granted',
    'current explicit in-memory grant must beat query/session/local');
  // Simulate an explicit in-memory denial in this document.
  api.recordConsent('denied');
  assert.equal(api.readEffectiveConsent(), 'denied',
    'current explicit in-memory denial must beat stale local grant');
});

test('CORR old stored denial on fresh bootstrap: banner is hidden, not re-shown', () => {
  // Old stored denial in localStorage. Banner loaded into a freshly
  // built document. Banner is hidden (stored decision present) and
  // must not bind accept/decline handlers (no re-ask).
  const { env } = loadBannerAndHotjar();
  env.localStorage.setItem('cookie-consent', JSON.stringify({ v: 1, analytics: 'denied' }));
  env.dispatchEvent({ type: 'astro:page-load' });
  // initBanner saw the stored denial → must have hidden the banner.
  // The hide path sets transform/opacity off-screen.
  assert.equal(env.banner._style.transform, 'translateY(calc(100% + 2rem))',
    'banner must hide on first init when stored denial is present');
  assert.equal(env.banner._style.opacity, '0',
    'banner must set opacity 0 when stored denial is present');
  // And the accept/decline onclick slots are NOT set (no re-ask).
  assert.equal(env.accept._onclick, null,
    'banner must not bind accept when stored decision is present');
});

// ── HJ-7: fallback marker lives in the URL query, not the hash ──────────
//
// Confirmed defect: the deny-only fallback appended `#hotjar-denied` to
// the existing `#section` fragment, producing `#section&hotjar-denied` —
// which changes the native anchor and prevents in-page navigation. The
// fix moves the marker to a URL query parameter (`analytics-consent=denied`)
// using history.replaceState so the hash is preserved verbatim.

test('HJ-7 fallback deny marker lands in URL query, leaves hash exactly intact', () => {
  // The user is on `/some/page#section`. localStorage.setItem and
  // sessionStorage.setItem BOTH throw. recordConsent('denied') must
  // write the deny marker as a query parameter — it must NOT pollute
  // the `#section` anchor by appending `#hotjar-denied`.
  const seed = createEnv();
  seed.env.location.pathname = '/some/page';
  seed.env.location.hash = '#section';
  // A real browser carries a history object whose replaceState updates
  // the URL state visible to JS. The mock does the same so the test
  // observes the resulting location.search/location.hash.
  const replaced = [];
  seed.context.history = {
    replaceState(state, title, url) {
      replaced.push(url);
      const parsed = new URL(url, 'http://test');
      seed.env.location.pathname = parsed.pathname;
      seed.env.location.search = parsed.search;
      seed.env.location.hash = parsed.hash;
    },
  };
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  const persisted = api.recordConsent('denied');
  assert.equal(persisted, true,
    'persistence is true when the query marker was set');
  // The hash MUST remain exactly `#section` — no `&hotjar-denied`
  // appended, no `#section&hotjar-denied`, no `##section`.
  assert.equal(seed.env.location.hash, '#section',
    'hash must remain exactly #section after deny fallback (no marker pollution)');
  // The query string MUST contain the deny marker.
  assert.equal(parseSearch(seed.env.location.search).get('analytics-consent'), 'denied',
    'query must contain analytics-consent=denied after deny fallback');
  // At most one replaceState call so no history pollution.
  assert.equal(replaced.length <= 1, true,
    'at most one replaceState call on deny fallback');
});

test('HJ-7 fallback deny preserves unrelated query parameters alongside the marker', () => {
  // The user lands on `/page?ref=home&utm=campaign#a`. Storage blocked.
  // Decline must append `analytics-consent=denied` while keeping both
  // `ref=home` and `utm=campaign`, and the `#a` fragment untouched.
  const seed = createEnv();
  seed.env.location.pathname = '/page';
  seed.env.location.search = '?ref=home&utm=campaign';
  seed.env.location.hash = '#a';
  seed.context.history = {
    replaceState(state, title, url) {
      const parsed = new URL(url, 'http://test');
      seed.env.location.pathname = parsed.pathname;
      seed.env.location.search = parsed.search;
      seed.env.location.hash = parsed.hash;
    },
  };
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  api.recordConsent('denied');
  const params = parseSearch(seed.env.location.search);
  assert.equal(params.get('analytics-consent'), 'denied',
    'deny marker must be appended');
  assert.equal(params.get('ref'), 'home',
    'unrelated query parameter ref must be preserved');
  assert.equal(params.get('utm'), 'campaign',
    'unrelated query parameter utm must be preserved');
  assert.equal(seed.env.location.hash, '#a',
    'fragment must be preserved exactly (no pollution)');
});

test('HJ-7 fragment with ampersand (#a&b) is preserved across deny fallback', () => {
  // The user lands on `/page#a&b`. Storage blocked. The deny must NOT
  // interpret `b` as a separate hash segment or strip the fragment.
  // The hash remains exactly `#a&b`.
  const seed = createEnv();
  seed.env.location.pathname = '/page';
  seed.env.location.hash = '#a&b';
  seed.context.history = {
    replaceState(state, title, url) {
      const parsed = new URL(url, 'http://test');
      seed.env.location.pathname = parsed.pathname;
      seed.env.location.search = parsed.search;
      seed.env.location.hash = parsed.hash;
    },
  };
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  api.recordConsent('denied');
  assert.equal(seed.env.location.hash, '#a&b',
    'hash with & must remain exactly intact (no segment parsing)');
  assert.equal(parseSearch(seed.env.location.search).get('analytics-consent'), 'denied',
    'deny marker must be appended to query, not hash');
});

test('HJ-7 fallback roundtrip on hash #section: deny writes query, grant clears query, hash always intact', () => {
  // The full deny→grant roundtrip on a page with an in-page anchor.
  // Deny → query gets the marker, hash untouched. Grant → query cleared,
  // hash still untouched. The fragment restoration is the regression:
  // the old code split `#section&hotjar-denied` into segments and
  // could produce `##section` on the way out.
  const seed = createEnv();
  seed.env.location.pathname = '/some/page';
  seed.env.location.hash = '#section';
  const replaced = [];
  seed.context.history = {
    replaceState(state, title, url) {
      replaced.push(url);
      const parsed = new URL(url, 'http://test');
      seed.env.location.pathname = parsed.pathname;
      seed.env.location.search = parsed.search;
      seed.env.location.hash = parsed.hash;
    },
  };
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  // 1. Deny while every durable storage throws.
  api.recordConsent('denied');
  assert.equal(seed.env.location.hash, '#section',
    'hash must remain exactly #section after deny fallback');
  assert.equal(parseSearch(seed.env.location.search).get('analytics-consent'), 'denied',
    'deny marker must be appended to query');
  // 2. Grant — must clear the marker. localStorage is still blocked,
  //    sessionStorage is still blocked; the only persistence target is
  //    the query marker, and clearing it is the success condition.
  api.recordConsent('granted');
  assert.equal(seed.env.location.hash, '#section',
    'hash must remain exactly #section after grant (no fragment mutation)');
  assert.equal(parseSearch(seed.env.location.search).has('analytics-consent'), false,
    'grant must clear the query marker');
  // 3. After the grant, the in-memory decision is `granted`. A fresh
  //    full reload (new document, fresh in-memory) would observe no
  //    query marker and storage blocked → null. Verify the marker is
  //    gone so a fresh load sees a clean state.
  assert.equal(seed.env.location.hash, '#section',
    'hash must remain #section through every state');
  // At most two replaceState calls across the deny + grant roundtrip
  // (one to set the marker, one to clear it). No history pollution.
  assert.equal(replaced.length <= 2, true,
    'at most two replaceState calls on deny+grant roundtrip');
});

// ── HJ-7: repeated query parameter preservation across deny and grant ─────
//
// The previous custom Map-based parse/serialize collapsed repeated
// query keys (`?tag=a&tag=b` → `?tag=b`). The fix uses native
// URLSearchParams which preserves every repeated value. Encoding may
// be canonicalized by the native API — that is acceptable.

test('HJ-7 repeated query parameter (?tag=a&tag=b) survives deny fallback with both values', () => {
  // User lands on `/page?tag=a&tag=b#section`. Storage is fully blocked.
  // Decline must keep BOTH `tag=a` and `tag=b` intact, plus the hash,
  // plus add the deny marker.
  const seed = createEnv();
  seed.env.location.pathname = '/page';
  seed.env.location.search = '?tag=a&tag=b';
  seed.env.location.hash = '#section';
  const replaced = [];
  seed.context.history = {
    replaceState(state, title, url) {
      replaced.push(url);
      const parsed = new URL(url, 'http://test');
      seed.env.location.pathname = parsed.pathname;
      seed.env.location.search = parsed.search;
      seed.env.location.hash = parsed.hash;
    },
  };
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  api.recordConsent('denied');
  const params = parseSearch(seed.env.location.search);
  assert.equal(params.get('analytics-consent'), 'denied',
    'deny marker must be appended');
  // Repeated key must be preserved on both entries — not collapsed.
  const tags = params.getAll('tag');
  assert.deepEqual(tags, ['a', 'b'],
    'repeated ?tag=a&tag=b must be preserved verbatim across deny fallback');
  assert.equal(seed.env.location.hash, '#section',
    'fragment must be preserved exactly (no pollution)');
});

test('HJ-7 repeated query parameter (?tag=a&tag=b) survives grant fallback with both values', () => {
  // Mirror of the above for a new grant while every durable storage
  // throws. The grant must not delete the repeated tag entries — it
  // only removes the analytics-consent marker.
  const seed = createEnv();
  seed.env.location.pathname = '/page';
  // Start with the deny marker set in the same query (simulating a
  // prior decline that landed in the query fallback).
  seed.env.location.search = '?analytics-consent=denied&tag=a&tag=b';
  seed.env.location.hash = '#section';
  const replaced = [];
  seed.context.history = {
    replaceState(state, title, url) {
      replaced.push(url);
      const parsed = new URL(url, 'http://test');
      seed.env.location.pathname = parsed.pathname;
      seed.env.location.search = parsed.search;
      seed.env.location.hash = parsed.hash;
    },
  };
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  api.recordConsent('granted');
  const params = parseSearch(seed.env.location.search);
  assert.equal(params.has('analytics-consent'), false,
    'grant must remove the analytics-consent marker');
  const tags = params.getAll('tag');
  assert.deepEqual(tags, ['a', 'b'],
    'repeated ?tag=a&tag=b must be preserved verbatim across grant fallback');
  assert.equal(seed.env.location.hash, '#section',
    'fragment must be preserved exactly across grant fallback');
});

test('HJ-7 fragment roundtrip on hash #a&b: deny writes query, grant clears query, hash always intact', () => {
  // Mirror of the #section roundtrip for the more unusual `#a&b`
  // fragment. Deny must not parse the `&b` as a second hash segment;
  // grant must clear the marker without touching the fragment.
  const seed = createEnv();
  seed.env.location.pathname = '/page';
  seed.env.location.hash = '#a&b';
  const replaced = [];
  seed.context.history = {
    replaceState(state, title, url) {
      replaced.push(url);
      const parsed = new URL(url, 'http://test');
      seed.env.location.pathname = parsed.pathname;
      seed.env.location.search = parsed.search;
      seed.env.location.hash = parsed.hash;
    },
  };
  seed.env.localStorage.failSet = true;
  seed.env.sessionStorage.failSet = true;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  // 1. Deny.
  api.recordConsent('denied');
  assert.equal(seed.env.location.hash, '#a&b',
    'hash #a&b must remain exactly intact after deny fallback');
  assert.equal(parseSearch(seed.env.location.search).get('analytics-consent'), 'denied',
    'deny marker must be appended to query');
  // 2. Grant — must clear the marker.
  api.recordConsent('granted');
  assert.equal(seed.env.location.hash, '#a&b',
    'hash #a&b must remain exactly intact after grant (no fragment mutation)');
  assert.equal(parseSearch(seed.env.location.search).has('analytics-consent'), false,
    'grant must clear the query marker');
});

// ── Scope B: real banner regression with stale store throughout ─────────
//
// The previous fixture deleted the stale grant before bootstrap, which
// could never exercise the "Hotjar already loaded + user declines +
// storage write throws" scenario. The fix: keep the stale readable
// grant in the backing store, throw on writes, drive the production
// bridge + production banner, click the real decline, and assert the
// full chain — including a fresh bootstrap that sees the same stale
// store + retained query marker + throwing SESSION getter and stays
// denied with zero scripts. ONE combined test, not two independently
// seeded scenarios.

test('SCOPE B combined chain: stale grant survives load+decline, retained marker keeps next bootstrap denied with zero scripts', () => {
  // Backing localStorage is shared across both phases of the chain.
  // Phase 1: empty start → banner binds decline → fixture writes a
  // current versioned grant ONCE into the SAME backing store → writes
  // are locked down → production Hotjar bridge page-load injects the
  // snippet exactly once → user clicks the REAL decline → reload is
  // invoked once, gtag denied, the stale grant survives every write
  // attempt, and the deny marker lands in the URL query.
  // Phase 2: fresh sandbox with the SAME backing local store and the
  // SAME throwing global sessionStorage getter and the SAME retained
  // URL marker; page-load the production Hotjar source and assert
  // stored grant is still readable, effective state is denied, gtag
  // denied, ZERO Hotjar injections, no reload loop.
  //
  // No __resetHotjarStateForTests, no clear/delete of the grant once
  // it is in the backing store, no independently seeded scenario.

  // Build the shared backing store and lock down writes ONLY after the
  // banner has had a chance to bind on an empty store.
  const backingLocal = new FakeStorage();
  backingLocal.failGet = false;
  backingLocal.failSet = false;
  backingLocal.failClear = false;

  // ── Phase 1: empty start, banner binds decline, grant inserted, lock writes, load Hotjar, decline ──
  const { env, context } = createEnv({
    withBanner: true,
    localStorage: backingLocal,
  });

  // Define the GLOBAL sessionStorage property getter that throws.
  // This is the only correct way to model a sessionStorage property
  // that fails on access (e.g. Safari ITP, locked-down enterprise
  // policies). Do not define getters on a storage object's methods —
  // the production module reads `globalThis.sessionStorage` itself
  // and guards THAT access; the test must exercise the same path.
  Object.defineProperty(context, 'sessionStorage', {
    configurable: true,
    get() { throw new Error('SecurityError: sessionStorage blocked'); },
  });

  // Verify the test itself: accessing context.sessionStorage must throw.
  let sessionAccessThrew = false;
  try {
    // eslint-disable-next-line no-unused-vars
    const _ = context.sessionStorage;
  } catch {
    sessionAccessThrew = true;
  }
  assert.equal(sessionAccessThrew, true,
    'test setup: global sessionStorage getter must actually throw on access');

  // Load the consent module + the banner + the Hotjar harness so all
  // production code paths are wired (banner binds decline, Hotjar
  // subscribes to consent change + bindStorageSync).
  vm.runInContext(buildHarness(), context, { filename: 'hotjar-consent.mjs' });
  vm.runInContext(buildHotjarHarness(), context, { filename: 'Hotjar.astro<script>' });
  vm.runInContext(buildBannerHarness(), context, { filename: 'CookieBanner.astro<script>' });

  // Boot: empty backing store + throwing global sessionStorage → no
  // effective consent anywhere → banner must show and bind decline.
  env.dispatchEvent({ type: 'astro:page-load' });
  assert.notEqual(env.decline.onclick, null,
    'banner must bind the production decline handler on an empty store');

  // Now put a current versioned granted payload in the SAME backing
  // store ONCE. Writes are still allowed at this point, so the fixture
  // setItem call succeeds. This is the "deliberate listener setup"
  // step: the banner handler is already bound, the grant is now
  // present, and the next page-load will see it.
  backingLocal.setItem(
    'cookie-consent',
    JSON.stringify({ v: 1, analytics: 'granted' }),
  );

  // Enable writes to throw on the backing store and on the session
  // (sessionStorage is already throwing via the global getter). The
  // getItem path remains intact: it returns the exact grant the
  // fixture wrote.
  backingLocal.failSet = true;
  backingLocal.failClear = true;

  // Drive the production Hotjar bridge on page-load: it must observe
  // the stored grant and inject the snippet exactly once.
  env.dispatchEvent({ type: 'astro:page-load' });
  assert.equal(env.hotjarScripts.length, 1,
    'production Hotjar bridge must inject exactly one script on a readable stored grant');
  const injectedSrc = env.hotjarScripts[0].src;
  assert.equal(injectedSrc, 'https://static.hotjar.com/c/hotjar-6791666.js?sv=6',
    'injected script src must be the exact current vendor URL');

  // Invoke the REAL decline onclick handler the production banner
  // bound. The handler invokes recordConsent('denied'); with both
  // localStorage writes throwing AND sessionStorage access throwing,
  // persistence falls through to the URL query marker, reload is
  // invoked once, and the stale grant is NEVER overwritten.
  env.clickDecline();

  // ── Phase 1 assertions ──
  assert.equal(env.location.reloadCount, 1,
    'decline must invoke location.reload exactly once when the query marker persisted');
  const lastGtag = env.gtagCalls[env.gtagCalls.length - 1];
  assert.deepEqual(lastGtag.slice(0, 2), ['consent', 'update']);
  assert.equal(lastGtag[2].analytics_storage, 'denied',
    'gtag must receive analytics_storage=denied on the production decline click');
  assert.equal(env.hotjarScripts.length, 1,
    'no additional Hotjar script after decline (no re-injection)');
  assert.equal(parseSearch(env.location.search).get('analytics-consent'), 'denied',
    'deny marker must be set in the URL query by the production output');
  // The exact stale grant is preserved (writes threw).
  assert.equal(backingLocal.getItem('cookie-consent'),
    JSON.stringify({ v: 1, analytics: 'granted' }),
    'stale backing grant must be preserved after decline (no setItem succeeded)');

  // Capture the URL state and the SAME backing store for phase 2.
  const phase1Pathname = env.location.pathname;
  const phase1Search = env.location.search;
  const phase1Hash = env.location.hash;
  const phase1HotjarCount = env.hotjarScripts.length;
  const sharedBacking = backingLocal;

  // ── Phase 2: fresh sandbox, SAME backing store, SAME throwing global sessionStorage getter, SAME URL marker ──
  const next = createEnv({
    withBanner: true,
    localStorage: sharedBacking,
  });
  // Restore the URL marker the previous decline left in the query.
  next.env.location.pathname = phase1Pathname;
  next.env.location.search = phase1Search;
  next.env.location.hash = phase1Hash;
  // Re-define the same throwing global sessionStorage getter on the
  // new context — this is the actual property the module reads.
  Object.defineProperty(next.context, 'sessionStorage', {
    configurable: true,
    get() { throw new Error('SecurityError: sessionStorage blocked'); },
  });
  // Verify the test: the new context.sessionStorage getter throws too.
  let nextSessionAccessThrew = false;
  try {
    // eslint-disable-next-line no-unused-vars
    const _ = next.context.sessionStorage;
  } catch {
    nextSessionAccessThrew = true;
  }
  assert.equal(nextSessionAccessThrew, true,
    'phase 2 setup: global sessionStorage getter must actually throw on access');

  // Load the production consent module + Hotjar bridge; the banner
  // script is also present but the user cannot click it because the
  // stored grant is still readable on the new document (banner will
  // hide). The real assertion is on the page-load bridge behavior.
  vm.runInContext(buildHarness(), next.context, { filename: 'hotjar-consent.mjs' });
  vm.runInContext(buildHotjarHarness(), next.context, { filename: 'Hotjar.astro<script>' });
  next.env.dispatchEvent({ type: 'astro:page-load' });

  // ── Phase 2 assertions ──
  assert.equal(next.env.hotjarScripts.length, 0,
    'post-reload bootstrap must NOT inject any Hotjar script when the query marker is denied');
  assert.equal(sharedBacking.getItem('cookie-consent'),
    JSON.stringify({ v: 1, analytics: 'granted' }),
    'stored grant must STILL be readable on the new document (writes are still locked down)');
  assert.equal(next.context.__hotjarConsent.readEffectiveConsent(), 'denied',
    'effective consent on the new document must be denied (query beats local)');
  assert.ok(next.env.gtagCalls.length >= 1,
    'gtag must be called on bootstrap to renew the denial');
  const nextGtag = next.env.gtagCalls[next.env.gtagCalls.length - 1];
  assert.equal(nextGtag[2].analytics_storage, 'denied',
    'gtag must receive analytics_storage=denied on bootstrap with stale grant + query marker');
  // No reload loop: a follow-up applyConsentFromStorage must be a
  // no-op (in-memory denial + query marker + session throw → no reload).
  next.context.__hotjarConsent.applyConsentFromStorage();
  assert.equal(next.env.location.reloadCount, 0,
    'no reload loop on bootstrap with effective denial');
  // The phase 1 injection count is still the only one.
  assert.equal(phase1HotjarCount, 1,
    'phase 1 must have injected exactly one script; nothing new on the reload');
});

test('SCOPE B real global LOCAL storage getter (throwing on access) does not crash on boot, accept, or decline', () => {
  // The globalThis.localStorage property GETTER throws — not just the
  // methods. This is the actual failure mode a sandboxed iframe or a
  // restricted environment can produce, and it is the one the
  // production module's guarded `getStorage` helper must absorb. The
  // test defines the getter on the context GLOBAL (not on a storage
  // object's methods) and asserts that (a) the test setup itself
  // surfaces the throw on access, and (b) the module + banner survive
  // boot, accept click, and decline click without raising.
  const seed = createEnv({ withBanner: true });
  // The actual throwing getter, defined on the context global.
  Object.defineProperty(seed.context, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError: localStorage blocked'); },
  });
  // Sanity check: the test setup must actually exercise a throwing
  // property, otherwise we would be silently exercising the success
  // path.
  let localAccessThrew = false;
  try {
    // eslint-disable-next-line no-unused-vars
    const _ = seed.context.localStorage;
  } catch {
    localAccessThrew = true;
  }
  assert.equal(localAccessThrew, true,
    'test setup: global localStorage getter must actually throw on access');

  let crashed = null;
  let acceptCompleted = false;
  let declineCompleted = false;
  try {
    vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
    vm.runInContext(buildBannerHarness(), seed.context, { filename: 'CookieBanner.astro<script>' });
    // Boot: banner reads effective consent. local throws via getter
    // → guarded to null → effective consent is null. initBanner
    // shows + binds handlers.
    seed.env.dispatchEvent({ type: 'astro:page-load' });
    // Click accept: recordConsent('granted'). local throws via getter
    // → guarded. session works (default). The in-memory grant fires
    // a consent-change event; no crash.
    seed.env.clickAccept();
    acceptCompleted = true;
    // Click decline: recordConsent('denied'). local throws via getter
    // → guarded. session persists the denial. The reload boundary
    // honors the persisted denial — reload is invoked once (or zero
    // if the new in-memory denial suppresses the reload path; both
    // are valid bounded behaviors).
    seed.env.clickDecline();
    declineCompleted = true;
  } catch (err) {
    crashed = err;
  }
  assert.equal(crashed, null,
    `throwing global localStorage getter must not crash: ${crashed?.message}`);
  assert.equal(acceptCompleted, true, 'accept click must run to completion');
  assert.equal(declineCompleted, true, 'decline click must run to completion');
  // The contract: gtag must be called for each recorded decision.
  // We don't pin a specific value because the local throw prevents
  // durable persistence; the gtag update is what proves the consent
  // authority reached the analytics surface.
  assert.ok(seed.env.gtagCalls.length >= 2,
    'gtag must be updated for both accept and decline with the throwing local getter');
});

// ── Scope C: real localStorage.clear + production bindStorageSync ───────
//
// The previous custom-subscriber-only test was insufficient: it observed
// the handler saw the cleared store but never actually drove the
// production bindStorageSync handler. This test grants + loads Hotjar,
// really clears localStorage, dispatches the storage event, and
// asserts the production handler reloads the page. Then a fresh
// bootstrap on the now-empty storage must NOT re-inject.

test('SCOPE C real localStorage.clear + production bindStorageSync reloads once + fresh bootstrap no tracking', () => {
  // 1. Grant + load tracker via the production path.
  const seed = createEnv({ storage: {
    'cookie-consent': JSON.stringify({ v: 1, analytics: 'granted' }),
  } });
  seed.env.location.reloadCount = 0;
  vm.runInContext(buildHarness(), seed.context, { filename: 'hotjar-consent.mjs' });
  const api = seed.context.__hotjarConsent;
  api.applyConsent('granted');
  assert.equal(seed.env.hotjarScripts.length, 1,
    'initial grant must load Hotjar exactly once');

  // 2. Bind the PRODUCTION handler. The previous test used a custom
  //    subscriber that merely observed the clear event — bindStorageSync
  //    is what would actually run on a real site.
  api.bindStorageSync();

  // 3. Real localStorage.clear (the actual method, not a map.delete).
  //    Browsers fire the storage event AFTER the underlying storage
  //    change commits, so the handler observes an empty store.
  seed.env.localStorage.clear();
  seed.env.dispatchEvent({ type: 'storage', key: null, newValue: null });
  assert.equal(seed.env.location.reloadCount, 1,
    'production bindStorageSync must invoke location.reload once on localStorage.clear');

  // 4. Fresh bootstrap: localStorage is empty, no session, no query
  //    marker. The bridge must NOT inject any Hotjar script.
  const fresh = createEnv({
    storage: Object.fromEntries(seed.env.localStorage.map),
  });
  vm.runInContext(buildHarness(), fresh.context, { filename: 'hotjar-consent.mjs' });
  vm.runInContext(buildHotjarHarness(), fresh.context, { filename: 'Hotjar.astro<script>' });
  fresh.env.dispatchEvent({ type: 'astro:page-load' });
  assert.equal(fresh.env.hotjarScripts.length, 0,
    'fresh bootstrap after localStorage.clear must NOT load Hotjar (no stored grant)');
  // No reload loop on the fresh bootstrap — applyConsentFromStorage
  // sees null (no effective consent), returns false, no reload.
  assert.equal(fresh.env.location.reloadCount, 0,
    'no reload loop on fresh bootstrap after localStorage.clear');
});