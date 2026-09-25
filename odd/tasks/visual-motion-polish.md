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