// Consent and Hotjar loader — shared logic for the analytics banner and the
// Hotjar tag. Browser-only side effects are guarded so this module is safe
// to import in Node (tests) and in Astro client bundles.
//
// Stored shape under localStorage key `cookie-consent`:
//   { "v": 1, "analytics": "granted" | "denied" }
//
// The legacy raw-string value ("granted" / "denied") left over from the
// previous banner is parsed as invalid and treated as missing, so the banner
// reappears and the user is asked to renew consent under the new shape.
//
// ── Authority contract (bounded correction) ─────────────────────────────
// `readEffectiveConsent` resolves the CURRENT consent value with this
// strict precedence (highest first):
//
//   1. `inMemoryConsent` — the explicit decision set by `recordConsent`
//      or a cross-tab/cross-event listener IN THIS document. This is
//      the user's most recent explicit choice; nothing overrides it.
//
//   2. URL query marker (`?analytics-consent=denied`) — a deny-only
//      fallback that survives a reload when both storages are blocked.
//      It is a DENIAL signal, so it is only honored when no explicit
//      grant exists in memory. The marker is written to the URL query
//      (not the hash) so it does not pollute in-page anchors like
//      `#section` or `#a&b` — appending to the hash would change the
//      native fragment identifier and break in-page navigation.
//
//   3. sessionStorage — durable within the same tab, survives reload.
//
//   4. localStorage (versioned) — durable across tabs and reloads.
//
//   5. `null` — no decision yet; banner re-asks.
//
// `inMemoryConsent` is NEVER seeded by the initial bootstrap read —
// that would mask a stored denial if the storage is then cleared by
// a cross-tab event. It is set ONLY by `recordConsent` (a new explicit
// choice) and by the cross-tab storage event (a new explicit choice in
// another tab that the current tab has now observed).

export const CONSENT_KEY = 'cookie-consent';
export const CONSENT_VERSION = 1;
export const hotjarSiteId = 6791666;
export const hotjarVersion = 6;
const CONSENT_CHANGE_EVENT = 'cookie-consent-change';
// Hotjar public snippet URL — the official, current vendor URL for hjsv 6.
// See https://help.hotjar.com/.
const HOTJAR_SCRIPT_URL = `https://static.hotjar.com/c/hotjar-${hotjarSiteId}.js?sv=${hotjarVersion}`;
// Deny-only URL marker. Survives reload because the query string is
// part of the URL. Not auto-erased — only cleared by an explicit new
// grant. Lives in the query (NOT the hash) so it never collides with
// in-page anchors like `#section` or `#a&b`; appending to the hash
// would change the native fragment identifier.
const DENY_QUERY_KEY = 'analytics-consent';
const DENY_QUERY_VALUE = 'denied';

// Module-level state. Both keys survive DOM swaps (Astro view transitions
// wipe the head but keep the global object alive) so the loader is
// idempotent across navigations within the same document lifetime.
//
// `inMemoryConsent` is the explicit current choice; `hotjarInjected`
// tracks the document-lifetime idempotency of the script tag.
let hotjarInjected = false;
let inMemoryConsent = null; // 'granted' | 'denied' | null — explicit choice only

// Pure gate: Hotjar loads only when the user has given explicit, current
// consent for analytics. Anything else (missing, denied, legacy string) is
// a no-load.
export function shouldLoadHotjar(value) {
  return value === 'granted';
}

// ── Guarded storage accessors ─────────────────────────────────────────────
//
// Some browsers (Safari ITP, locked-down enterprise policies, sandboxed
// iframes) expose `localStorage` / `sessionStorage` getters that THROW on
// access. Reading `globalThis.localStorage` itself is therefore unsafe
// outside a try/catch. These accessors wrap the access; on any throw
// they return `null` so the caller can fall through to the next layer.

// which: 'localStorage' | 'sessionStorage'
function getStorage(which) {
  try {
    return globalThis[which] ?? null;
  } catch {
    return null;
  }
}

function getItemFrom(which, key) {
  const storage = getStorage(which);
  if (!storage) return null;
  try {
    return storage.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setItemOn(which, key, value) {
  const storage = getStorage(which);
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeItemFrom(which, key) {
  const storage = getStorage(which);
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// ── Value parsing ────────────────────────────────────────────────────────
// Conservative parser: only the exact versioned JSON shape counts as a
// current consent. Legacy raw strings and corrupt payloads fall through
// as null (banner re-asks).

function parseConsentPayload(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.v === CONSENT_VERSION &&
      (parsed.analytics === 'granted' || parsed.analytics === 'denied')
    ) {
      return parsed.analytics;
    }
  } catch {
    // Legacy raw string or corrupt JSON — fall through as missing.
  }
  return null;
}

function serializeConsent(value) {
  return JSON.stringify({ v: CONSENT_VERSION, analytics: value });
}

// ── Public storage read (localStorage only — the durable layer) ──────────

export function readStoredConsent() {
  return parseConsentPayload(getItemFrom('localStorage', CONSENT_KEY));
}

// LocalStorage-only write. Returns true if the value landed in localStorage,
// false otherwise. This is what `recordConsent` reports for the banner's
// reload decision; the same function also writes the sessionStorage/URL
// override (see below).
export function writeStoredConsent(value) {
  if (value !== 'granted' && value !== 'denied') return false;
  return setItemOn('localStorage', CONSENT_KEY, serializeConsent(value));
}

// ── Same-tab override layer ──────────────────────────────────────────────

function readSessionOverride() {
  return parseConsentPayload(getItemFrom('sessionStorage', CONSENT_KEY));
}

function readQueryOverride() {
  // The deny marker lives in the URL QUERY (not the hash) so it does
  // not collide with in-page anchors like `#section` or `#a&b`.
  // Appending to the hash would change the native fragment identifier
  // and break in-page navigation — this is the bug the bounded
  // correction fixes.
  try {
    const search = globalThis.location?.search || '';
    return search.includes(`${DENY_QUERY_KEY}=${DENY_QUERY_VALUE}`) ? 'denied' : null;
  } catch {
    return null;
  }
}

// Effective consent for this document. Precedence (highest first):
//   inMemoryConsent (explicit current) > query denial > session > local > null
//
// This is the single reader used by both the banner and the Hotjar sync
// path. Both surfaces must agree — a divergence is a documented bug.
export function readEffectiveConsent() {
  if (inMemoryConsent === 'granted' || inMemoryConsent === 'denied') {
    return inMemoryConsent;
  }
  const query = readQueryOverride();
  if (query) return query;
  const session = readSessionOverride();
  if (session) return session;
  return readStoredConsent();
}

function clearSessionOverride() {
  removeItemFrom('sessionStorage', CONSENT_KEY);
}

function setSessionOverride(value) {
  return setItemOn('sessionStorage', CONSENT_KEY, serializeConsent(value));
}

// Build a URLSearchParams from the current location.search. Native
// URLSearchParams preserves repeated keys (`?tag=a&tag=b` → both
// entries) and keeps unrelated parameters intact across set/delete.
// Encoding is canonicalized by the native API (e.g. ` ` → `+`) which
// is acceptable for the analytics-consent marker and is what
// `history.replaceState` round-trips.
function parseQuery(search) {
  const raw = (search || '').replace(/^\?/, '');
  return new URLSearchParams(raw);
}

function serializeQuery(params) {
  const out = params.toString();
  return out.length > 0 ? `?${out}` : '';
}

// Set the URL query deny marker WITHOUT touching the hash or any other
// query parameter. Uses `history.replaceState` when available to avoid
// adding a new history entry. The hash is preserved verbatim: in-page
// anchors like `#section` or `#a&b` are never modified.
function setQueryOverride() {
  try {
    const loc = globalThis.location;
    if (!loc) return false;
    if (typeof globalThis.history?.replaceState !== 'function') return false;
    const params = parseQuery(loc.search);
    params.set(DENY_QUERY_KEY, DENY_QUERY_VALUE);
    const nextSearch = serializeQuery(params);
    const nextUrl = `${loc.pathname || ''}${nextSearch}${loc.hash || ''}`;
    globalThis.history.replaceState(null, '', nextUrl);
    return true;
  } catch {
    return false;
  }
}

function clearQueryOverride() {
  try {
    const loc = globalThis.location;
    if (!loc) return;
    if (typeof globalThis.history?.replaceState !== 'function') return;
    const params = parseQuery(loc.search);
    if (!params.has(DENY_QUERY_KEY)) return;
    params.delete(DENY_QUERY_KEY);
    const nextSearch = serializeQuery(params);
    const nextUrl = `${loc.pathname || ''}${nextSearch}${loc.hash || ''}`;
    globalThis.history.replaceState(null, '', nextUrl);
  } catch {
    /* sandboxed env */
  }
}

// ── Event dispatch ───────────────────────────────────────────────────────

function emitConsentChange(value) {
  // DispatchEvent unavailable (very old env, or no globalThis) — skip.
  if (typeof globalThis.dispatchEvent !== 'function') return;
  globalThis.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: value }));
}

export function subscribeConsentChange(handler) {
  if (typeof handler !== 'function') return () => {};
  globalThis.addEventListener?.(CONSENT_CHANGE_EVENT, (event) => {
    handler(event.detail);
  });
  return () => {
    globalThis.removeEventListener?.(CONSENT_CHANGE_EVENT, handler);
  };
}

// ── GA consent ───────────────────────────────────────────────────────────

// Banner entry point — called both inline at boot (when storage already
// records current consent) and from the click handlers after writing.
export function applyGaConsent(value) {
  if (typeof globalThis.gtag !== 'function') return;
  globalThis.gtag('consent', 'update', {
    analytics_storage: value === 'granted' ? 'granted' : 'denied',
  });
}

// ── Public record API ────────────────────────────────────────────────────

// Combined write + override + GA update + event dispatch. Used by banner
// click handlers to keep the banner and any subscriber (Hotjar) in sync
// after a choice.
//
// Persistence contract:
//   - `granted`: writes localStorage (best effort), then clears every
//     override (session + URL query). If the session override cannot be
//     cleared (storage blocked), we OVERWRITE it with the new grant so
//     a reload reads `granted` from the override layer too. The reload
//     decision returns true if at least localStorage OR sessionStorage
//     or the URL query cleared, so the caller can reload once and the
//     next load will read the new grant.
//   - `denied`: writes localStorage and sessionStorage. Only when
//     NEITHER durable target persists do we add the URL query marker,
//     and when we do, we preserve the existing hash verbatim (using
//     history.replaceState, not pushState) so we do not destroy an
//     in-page navigation anchor like `#section`. The reload decision
//     returns true if at least one of (localStorage, sessionStorage,
//     URL query) persisted.
export function recordConsent(value) {
  if (value !== 'granted' && value !== 'denied') return false;
  if (value === 'granted') {
    // Set the in-memory explicit choice FIRST so any subsequent read
    // honors the new grant even before storage writes return.
    inMemoryConsent = value;
    const persistedLocal = writeStoredConsent(value);
    // Best-effort override clear. If session can't be cleared (it
    // currently holds a denial), OVERWRITE it with the new grant so
    // a reload reads `granted` from the session layer.
    const sessionCleared = removeItemFrom('sessionStorage', CONSENT_KEY);
    const sessionOverwritten = sessionCleared
      ? true
      : setSessionOverride(value);
    clearQueryOverride();
    applyGaConsent(value);
    emitConsentChange(value);
    return persistedLocal || sessionOverwritten;
  }
  // `denied`: set the in-memory explicit choice first, then persist.
  inMemoryConsent = value;
  const persistedLocal = writeStoredConsent(value);
  const persistedSession = setSessionOverride(value);
  // Only fall back to the URL query marker when BOTH durable targets
  // failed. When we DO set the marker, use replaceState so we do not
  // touch the user's existing hash and do not add a new history entry.
  const persistedQuery = (persistedLocal || persistedSession)
    ? false
    : setQueryOverride();
  applyGaConsent(value);
  emitConsentChange(value);
  return persistedLocal || persistedSession || persistedQuery;
}

// Read the effective consent (inMemoryConsent > query > session > local)
// and apply the decision. This is what runs on `astro:page-load` — the
// effective reader guarantees the user's most-recent explicit choice is
// honored, including a denial set on this same document.
export function applyConsentFromStorage() {
  const effective = readEffectiveConsent();
  if (effective) return applyConsent(effective);
  return false;
}

// Apply a concrete decision. Used on boot and from banner click flows.
// IMPORTANT: this function does NOT set `inMemoryConsent` — that would
// mask a future cross-tab storage event. `inMemoryConsent` is set only
// by `recordConsent` (a new explicit choice) and by the cross-tab
// storage listener (a new explicit choice observed in another tab).
// Returns true when Hotjar was loaded.
export function applyConsent(value) {
  if (value !== 'granted' && value !== 'denied') return false;
  applyGaConsent(value);
  if (shouldLoadHotjar(value)) {
    return loadHotjar();
  }
  return false;
}

export function loadHotjar() {
  if (hotjarInjected) return false;
  const doc = globalThis.document;
  const win = globalThis.window;
  if (!doc || !win) return false;
  try {
    const target = doc.getElementsByTagName('head')[0] || doc.body || doc.documentElement;
    if (!target) return false;
    const script = doc.createElement('script');
    script.async = true;
    script.src = HOTJAR_SCRIPT_URL;
    script.setAttribute('data-hj', String(hotjarSiteId));
    target.appendChild(script);
    // Seed the hj queue so any calls queued before snippet load are honored.
    // Preserve an existing hj function — the official snippet relies on
    // `window.hj.q` to flush queued calls, so we must NEVER overwrite a
    // real function with our own shim.
    if (typeof win.hj !== 'function') {
      win.hj = function () { (win.hj.q = win.hj.q || []).push(arguments); };
    }
    win._hjSettings = Object.assign({}, win._hjSettings, {
      hjid: hotjarSiteId,
      hjsv: hotjarVersion,
    });
    hotjarInjected = true;
    return true;
  } catch {
    return false;
  }
}

// ── Cross-tab storage sync (HJ-4) ────────────────────────────────────────

// Storage event subscription. Accepts:
//   - `key === CONSENT_KEY` — another tab wrote/removed OUR key.
//   - `key === null`        — another tab called localStorage.clear.
//
// Both are withdrawal signals. The handler is responsible for deciding
// whether to reload (only if the snippet was injected on this tab) and
// for honoring a granted change.
export function subscribeStorageChange(handler) {
  if (typeof handler !== 'function') return () => {};
  const wrapped = (event) => {
    if (!event) return;
    const isOurKey = event.key === CONSENT_KEY;
    const isClear = event.key === null;
    if (isOurKey || isClear) handler(event);
  };
  globalThis.addEventListener?.('storage', wrapped);
  return () => {
    globalThis.removeEventListener?.('storage', wrapped);
  };
}

// Default storage handler used by the Hotjar component. The decision
// matrix is:
//
//   - granted on this tab: set inMemoryConsent = granted, load Hotjar
//     (idempotent if already loaded).
//   - denied payload on this tab: set inMemoryConsent = denied, reload
//     iff Hotjar was injected.
//   - key deletion (`key === CONSENT_KEY && newValue === null`):
//     treat as withdrawal. Reload iff Hotjar was injected. The override
//     layer means the next load will read `denied` regardless of any
//     stale localStorage grant.
//   - localStorage.clear (`key === null`): treat as withdrawal. Same
//     reload rule.
//
// The reload is bounded: only triggered when the snippet was injected
// on this tab. If the snippet never started, the next full load will
// naturally observe the new state.
export function bindStorageSync() {
  return subscribeStorageChange((event) => {
    if (!event) return;
    const isClear = event.key === null;
    const isOurKey = event.key === CONSENT_KEY;
    if (!isClear && !isOurKey) return;
    const isDeletion = isOurKey && event.newValue === null;
    if (isClear || isDeletion) {
      // Withdrawal: reload iff the snippet was injected on this tab.
      if (hotjarInjected) {
        try { globalThis.location?.reload?.(); } catch { /* sandboxed env */ }
      }
      return;
    }
    const next = parseConsentPayload(event.newValue);
    if (next === 'granted') {
      inMemoryConsent = 'granted';
      applyConsent('granted');
      return;
    }
    if (next === 'denied' && hotjarInjected) {
      inMemoryConsent = 'denied';
      try { globalThis.location?.reload?.(); } catch { /* sandboxed env */ }
    }
  });
}

// Reset internal state. Exposed for tests and for forced re-binding in
// non-browser environments.
export function __resetHotjarStateForTests() {
  hotjarInjected = false;
  inMemoryConsent = null;
}
