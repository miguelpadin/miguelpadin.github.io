# Visual motion polish — portfolio

## Objective
Raise MOTION_INTENSITY from ~2 to ~6 without changing brand identity (warm paper bg, Archivo, orange accent #E8542F). Add texture, staggered motion and micro-interactions so the page stops reading like a static CV.

## Why
User request: "dale un poco más de vidilla al diseño, efectos, etc que no parezca un cv en pdf".

## Scope
- `src/styles/global.css` — grain overlay, scroll progress, hero stagger/underline-draw keyframes, job-entry hover bar, contact hover fill, icon link lift, hero radial tint, skills group hover.
- `src/components/Hero.astro` — word-level name stagger, SVG accent underline draw, hairline scaleX grow, icons staggered fade.
- `src/components/Experience.astro` — no markup change (CSS-only hover bar via .job-entry::before).
- `src/components/Contact.astro` — rows get hover surface fill + inline padding/margin offsets.
- `src/components/Skills.astro` — group hover accent border-top class.
- `src/layouts/Layout.astro` — scroll progress element + rAF-throttled script.

## Constraints
- No new dependencies (CSS + vanilla JS only).
- All entry/motion animations gated behind `@media (prefers-reduced-motion: no-preference)`.
- Keep palette and section structure untouched; artifacts in English.

## Checklist
- [x] T1: global.css additions (grain, progress, keyframes, hovers, hero tint)
- [x] T2: Hero.astro stagger + underline + rule + icons
- [x] T3: Contact.astro hover fill rows (no edit needed — .contact-row class already present)
- [x] T4: Skills.astro group hover class
- [x] T5: Layout.astro progress bar + script
- [x] T6: `pnpm build` passes — observed: "14 page(s) built in 1.01s", exit 0

## Acceptance
- Build passes; reduced-motion users get a static page; no layout shift on mobile.

## Route
Delegated direct (writer trigger: 2+ non-trivial files). TDD: not applicable (static markup/CSS, no test runner configured in project).

## Progress
- Writer agent (ses_f27f01510ffeu3VvMZth3BnQKT): completed. Files: global.css, Hero.astro, Skills.astro, Layout.astro. Contact.astro unchanged (already correct).
- Verification: parent structural readback of all 4 files + `pnpm build` re-run (exit 0).
- Engram mirror: PENDING — mem_save failed with session-ambiguity error (multiple active runtime sessions); local file is source of truth.
- Commit evidence: 125a804 "feat(design): add motion polish — grain texture, scroll progress, hero stagger, hover micro-interactions".
- RDD status: off (global) — no review ceremony; ordinary checks only.
- Commit evidence: 125a804 (revision 1).

## Revision 2 — user feedback: "still too PDF-CV, underline looks weird"
Accepted changes: remove hero underline; break the uniform document flow. New intent: each section gets its own layout family, motion dial up (parallax, marquee, outline display type).

- [x] R1: Remove .hero-underline SVG from Hero.astro + its CSS (keyframes, 480px hide, reduced-motion refs)
- [x] R2: Hero — mouse spotlight (var-driven radial, pointer:fine only) + scroll parallax on the big name (data-parallax, rAF in Layout script, reduced-motion gated)
- [x] R3: Hero bottom — full-bleed marquee strip of core skills (two duplicated groups, 40s linear, pause on hover, hairline top/bottom, static under reduced motion)
- [x] R4: Skills — replace comma-text groups with icon-pill grid (borrow+extend SkillsLogos icons map into Skills.astro, tooltips, letter fallback), keep languages strip
- [x] R5: Experience — drop per-entry hairlines, bigger display company type, sticky period column on lg, pulsing "Current" dot (reduced-motion: static)
- [x] R6: Contact — giant display heading (clamp 2.5–5rem), second line accent outline (-webkit-text-stroke), keep rows
- [x] R7: `pnpm build` passes

## Revision 3 — user feedback: "no me gusta el carrusel"
Accepted change: remove the hero marquee entirely. No replacement strip; hero keeps spotlight + parallax + stagger. Marquee was the only full-bleed element — hero returns to clean poster layout.

- [x] R8: Remove .hero-marquee block from Hero.astro + all marquee CSS/keyframes/entrance from global.css; hero padding back to pb-16
- [x] R9: Audit + fix skill icons against official sources (simple-icons slugs.md, devicon devicon.json). Fixes: Nuxt->si/nuxt, Oracle/PL-SQL->devicon/oracle, macOS->si/macos, SonarQube->sonarqubecloud, Codex/OpenAI->fallback (si dropped OpenAI), Vuex/BootstrapVue/ESM patching with Vue logo->fallback, CSS3->css slug, new items mapped (ESLint, Prettier, Husky?, Scrum?, npm, pnpm, Vercel, GitHub Pages, Supabase, DeepSeek, Cursor, OpenCode, CodeRabbit, Ollama, LM Studio, PWA, JS). All 51 referenced CDN slugs verified 200. Concept skills keep generic SVG (no official brand mark exists).
- Commit evidence: 083f26a (revision 3: marquee removed + official logos).

## Revision 4 — user feedback: "sigue pareciendo una web muy básica"
Accepted changes: editorial-scale typography + bento rhythm + one deliberate theme inversion. Root cause: uniform document skeleton (same-width sections, small headings, flat background everywhere).

- [x] R10: Section h2s to editorial scale clamp(2.25rem, 5vw, 3.75rem), tighter leading (applies to Experience, Skills, Contact)
- [x] R11: Skills groups to asymmetric bento grid (6-col: spans 4/2, 3/3, 4/2) with varied cell treatments (AI cell accent-tinted, Testing cell surface-inverted)
- [x] R12: Contact = full-bleed accent block, giant outline display heading, paper-tone rows/hovers
- [x] R13: Hero name full-stop accent + subtle scroll cue
- [x] R14: `pnpm build` passes
- Commit evidence: 10177c4 (revision 4: editorial scale + bento + contact inversion). Engram mirror: still pending (session-ambiguity defect).
- [x] R15: Remove hero scroll cue (user found it confusing) — div + all CSS/keyframes. Commit 6a41e6b.

## Revision 5 — "sigue muy básica para alguien de front-end" → structural overhaul
User authorized the 3-part structural plan ("ok") and delegated the hero-visual choice to me. Decision: mock de código con typing effect (entregable completo hoy, comunica el oficio; foto puede añadirse después sustituyendo el panel).

- [x] R16: Hero split-screen asymmetric (~55/45 lg): left type as-is; right = code-editor mock panel (window chrome dots + filename tab + real Vue/TS snippet with CSS typing animation + blinking caret), floating shadow, slight rotate, reduced-motion = static full text
- [x] R17: NEW Projects section between Experience and Skills: 2 large cards with real project content from t.experience (Roomdoo PMS + manufacturing platform), screenshot placeholder slots with TODO comment, stack pills, links; section ID projects + nav link in i18n? NO — i18n read-only, so anchor exists without nav entry for now
- [x] R18: Experience section dark inversion (bg var(--color-fg), paper text, hue2→accent-text labels, hairlines rgba paper, hover bar stays)
- [x] R19: `pnpm build` passes
- Commit evidence: 5dbdbb6 (revision 5: split hero + code mock, Projects section, dark Experience).

## Revision 6 — user rejection: code mock + Selected Work removed
User rejected the code-mock panel ("queda rara") and the Projects/Selected Work section (rejected twice, including pre-overhaul). Reverted both via git revert of 5dbdbb6+bba705b (conflicts in global.css and task doc resolved keeping HEAD). Kept from revision 5: dark Experience inversion.

- [x] R21: Revert code-mock + Projects section. Commit c0a1046.
- LESSON: user already disliked Selected Work before the overhaul ("no me gusta lo de selected work, te lo he dicho antes ya") — it was originally my R17 proposal. Do not defend rejected elements; ask what to add INSTEAD before building new structural sections.
- [x] R22: Restore dark Experience (it traveled inside the reverted 5dbdbb6 commit — my earlier claim that it survived was wrong, verified and corrected). Re-applied: ink bg, paper headings, accent periods/Current, rgba-paper body, bright accent link hover. Commit d351245.
- [x] R23: Favicon single "M" — public/favicon.svg rewritten (ink bg, paper M, Archivo 700) + favicon.ico regenerated from SVG via qlmanage+PIL. Commit 994b39f.

## Revision 7 — "dale más efectos, que parezca alguien de front-end"
Physics-and-input motion pass: response to cursor and scroll velocity (the frontend-tell), not decorative loops.

- [x] R24: Scroll velocity skew on main content (subtle max 1.2deg, rAF, lerped decay, reduced-motion gated)
- [x] R25: Text scramble decode on nav link hover (Header, rAF-free interval-free char reveal, reduced-motion = plain hover)
- [x] R26: Magnetic pull on hero icon links (transform toward cursor within radius, spring-back on leave, pointer:fine + reduced-motion gated)
- [x] R27: Spotlight border on skill icon pills (per-pill radial border glow tracking cursor, pointer:fine only)
- [x] R28: `pnpm build` passes
- Commit evidence: e0f7955 (revision 7: physics/input motion pass). Skew-host applied via JS (pages render their own main — writer deviation, correct).
- [x] R29: Legal pages (legal/privacy/cookies x3 locales) widen from 680px to 1024px to match site grid. Commit 1dfd7d5.
