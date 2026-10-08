# Hotjar consent integration

## Objective
Integrate Hotjar Site ID 6791666 (hjsv 6) without dependencies, only after renewed analytics consent, with accurate EN/ES/GL disclosures.

## Scope and constraints
Existing analytics category; invalidate previous GA-only grants. Preserve the current GA loader and disclose possible cookieless measurements. The user explicitly authorized a commit and push to origin/feat/hotjar-consent. No pull request, merge, new dependencies or live vendor requests authorized. RDD remains globally off.

## Delivery status
All retained scoped blockers closed by independent validation. Controlled withdrawal/reload and suppressed next injection verified in the simulated production-source environment; live vendor behavior remains unverified. Final precommit checks passed; commit and branch push authorized.

## Tasks and progress
- [x] HJ-1: Initial consent-gated integration and localized disclosures implemented.
- [x] HJ-2: Correct vendor URL, preserve hj and document-lifetime injection guard, bind banner after Astro navigation, remove unsupported disclosure claims.
- [x] HJ-3: Withdrawal under blocked storage: code uses explicit memory > denial URL marker > session > local, combined loaded-tracker withdrawal and stale-store reload proof observed against the production bridge and banner.
- [x] HJ-4: Cross-tab key deletion/clear implemented; combined real `localStorage.clear` + production `bindStorageSync` reload + fresh bootstrap no tracking test added.
- [x] HJ-5: EN/ES/GL cookie disclosures now acknowledge GA cookieless pings with denied analytics storage.
- [x] HJ-6: Actual banner source tests added, with backing localStorage containing versioned granted preserved throughout, throwing global SESSION/Local storage GETTERS exercised (not just method throws), and no in-fixture grant deletion before decline.
- [x] HJ-7: Fallback marker moved to URL query (`?analytics-consent=denied`) so in-page anchors like `#section` and `#a&b` remain exactly intact across deny/grant roundtrips. Repeated query keys (`?tag=a&tag=b`) now survive deny and grant. parseQuery/serializeQuery replaced with native URLSearchParams (added to VM sandbox globals).

## Route and authorization
Delegated direct: multi-file implementation and preparation require one writer. Independent read-only verification required because native risk assessment is high/unassessable (untracked inventory). One bounded correction after verification was run; no further correction loop started. Commit and push explicitly authorized on feat/hotjar-consent; base remains a3cdcbbf25ee15f521993c1144d804e9b0f84597.

## Acceptance
No Hotjar without current grant. Correct URL https://static.hotjar.com/c/hotjar-6791666.js?sv=6, once per document, preserve existing hj. Latest explicit choice overrides old consent; denial survives reload even when local writes fail. Effective consent reader shared by banner and tracker. Successful withdrawal ends loaded document by controlled reload with persisted denial. Storage-object getter exceptions must not bypass fallback. Navigation does not re-prompt an accepted in-memory choice. Policies accurately distinguish GA cookie storage and transmission. Repeated unrelated query parameters survive deny and grant roundtrips.

## Observed verification
Writer observed RED for the repeated-query-key regression against the old Map-based parseQuery (two failing tests, exact diff captured). GREEN after switching parseQuery/serializeQuery to native URLSearchParams. Final independent validation observed `node --test tests/hotjar-consent.test.mjs`: 56 passed, 0 failed/skipped; `pnpm build`: 14 pages built successfully; `rtk git diff --check`: empty output. Independently confirmed the combined production-source withdrawal/reload chain, actual global storage getters, real clear/default-handler behavior, repeated query preservation and complete fragment roundtrips. Browser/live network verification unperformed; no live vendor cessation claim.

## Combined chain shape (SCOPE B)
- Phase 1: backing store empty → production banner boot binds decline → fixture writes the current versioned granted payload once into the same backing store (writes allowed) → writes locked down → production Hotjar bridge page-load injects the snippet exactly once → real decline click → reload=1, gtag denied, deny marker in query, stale grant preserved.
- Phase 2: fresh sandbox with the same backing store, the same throwing global sessionStorage getter (Object.defineProperty on the context global), and the same retained URL marker → production Hotjar source page-load → stored grant still readable, effective denied, gtag denied, zero Hotjar injections, no reload loop.
- The test does NOT call `__resetHotjarStateForTests` and never deletes or clears the grant once it is in the backing store. The "empty start then fixture grant" sequence is a deliberate listener setup, and exact stale retention begins only after the grant is inserted.
- The global sessionStorage getter is defined on the context object via `Object.defineProperty(context, 'sessionStorage', {configurable: true, get() {throw new Error('SecurityError');}})`, never on a storage object's methods.

## Final independent findings
All retained criteria confirmed against actual source and executed tests. Combined chain: tests/hotjar-consent.test.mjs:1771–1947; actual localStorage getter:1949–2012; real clear/default handler:2023–2061; fragment and repeated query cases:1599–1757. Native URLSearchParams preserves repeated query values and fragments. No remaining scoped findings identified. This is functional validation, not native review approval; RDD remains off.

## Delivery strategy
The user requested a commit and push of the current coherent work unit. Keep behavior, localized disclosures and regression tests together in one Conventional Commit. No pull request requested. The original forecast was exceeded by test expansion; do not code-golf to meet the advisory budget.

## Next step
Create the authorized commit and push feat/hotjar-consent to origin. Optional next proof: local browser smoke test with intercepted vendor requests. Pull request, merge and live vendor checks require separate authorization. All retained scoped implementation/proof tasks are complete.
