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
- [ ] T1: global.css additions (grain, progress, keyframes, hovers, hero tint)
- [ ] T2: Hero.astro stagger + underline + rule + icons
- [ ] T3: Contact.astro hover fill rows
- [ ] T4: Skills.astro group hover class
- [ ] T5: Layout.astro progress bar + script
- [ ] T6: `pnpm build` passes

## Acceptance
- Build passes; reduced-motion users get a static page; no layout shift on mobile.

## Route
Delegated direct (writer trigger: 2+ non-trivial files). TDD: not applicable (static markup/CSS, no test runner configured in project).