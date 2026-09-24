# Visual Redesign — CV Web (Radical Overhaul)

## Objective
Complete visual redesign of miguelpadin.github.io: from dark navy "AI-flavored" theme to a light editorial/Swiss-style CV site. Must not read as AI-generated.

## Problem
Current site relies on classic AI tells: cursor particle trail, text scramble hero, magnetic links, dot-grid spotlight glow, pill shimmer, pulse dots, 3D tilt on job entries. User wants a radical visual change ("que parezca otra web") that does not smell like AI.

## Design Direction
- **Design Read:** personal CV/portfolio for recruiters + technical peers; editorial/Swiss light language; custom CSS (no design system dependency).
- Dials: DESIGN_VARIANCE 7, MOTION_INTENSITY 3, VISUAL_DENSITY 3.
- Light theme locked (single theme, no toggle). Warm paper-neutral base, off-black ink, ONE accent.
- Typography: sans display, no serif default, no Inter. Restrained tracking, no eyebrow-spam.
- Kill all slop: particle trail, scramble, magnetic links, spotlight, shimmer, pulse dot, 3D tilt, scroll progress bar, tab easter egg.
- Keep: i18n (en/es/gl), all real content, SEO/JSON-LD, cookie banner, theme-color handling (now light only), sitemap/hreflang.

## Scope
- src/styles/global.css (tokens rewrite, light palette)
- src/layouts/Layout.astro (remove slop effects)
- src/components/{Header,Hero,Experience,Skills,Contact,Footer,Logo}.astro
- Keep CookieBanner + legal pages functional (they use tokens).

## Constraints
- No new dependencies (Astro + Tailwind 4 already present).
- Keep build green: `pnpm build`.
- Keep all hrefs/links/emails/phones unchanged.
- Editorial asymmetry: no centered hero, max 1 eyebrow total across page.
- Preserve responsive collapse (mobile single-column).
- prefers-reduced-motion honored for any remaining transitions.

## Acceptance Criteria
- [x] Build passes (`pnpm build`)
- [x] Light editorial theme applied everywhere; no section inversion
- [x] All AI-tell effects removed
- [x] i18n works on all 3 languages (spot check es/ index)
- [x] Dark-mode toggle removed; theme-color meta updated
- [x] Visual spot check: hero asymmetric, hierarchy via type weight/color

## Progress
- [x] Task 1: Design tokens + global.css rewrite (light editorial palette)
- [x] Task 2: Layout.astro cleanup (remove slop scripts/effects)
- [x] Task 3: Header.astro (no dark toggle, light header)
- [x] Task 4: Hero.astro (no scramble, no magnetic, asymmetric editorial hero)
- [x] Task 5: Experience.astro (no tilt/glow, editorial rows)
- [x] Task 6: Skills.astro (no shimmer pills, grouped lists)
- [x] Task 7: Contact.astro + Footer.astro (editorial close)
- [x] Task 8: Logo.astro (light logo) + verify es/gl pages, build, commit

## Route
- Delegated direct (writer): all components share tokens; single writer keeps coherence.
- Verification: build + structural readback + visual check via dev server.

## Notes
- Branch: redesign/visual-overhaul
- Accent choice: ink + one saturated accent (electric blue reserved; final pick by writer, must not be AI-purple).