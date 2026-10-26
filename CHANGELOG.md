# Changelog

Dates are omitted on purpose: versions are git commits on `master`.

## 0.9.1 (Phase 7: quality gate)
- Accessibility fixes from an axe-core audit: muted text and filled-control colours now meet WCAG AA contrast in both themes; control names now contain their visible text (template cards, Use template, Checklist, Export PDF, colour reset); photo file input is labelled; heading order fixed on Templates and the cover-letter start page; template filter chips wrap instead of hiding behind a sideways scroller.
- Template-card thumbnails are hidden from assistive technology (a rendered sample resume is not link text).
- `vercel.json`: fonts are cached for a week.
- New checks: `e2e/phase7.mjs` (axe in light and dark on 10 views, 9 viewport sizes, reduced motion, keyboard-only, forced colours) and `e2e/phase7b.mjs` (service-worker update with unsaved typing, storage quota failure, Unicode and hostile text, long URL, long resumes on A4 and Letter).
- Docs: LIMITATIONS.md, DEPLOYMENT.md, acceptance matrix in TEST_PLAN.md.

## 0.9.0 (Phase 6.2)
Styles survive template switches; real italics; Latin-extended, Cyrillic, Greek and Vietnamese fonts; Move blocks (drag, arrows, sliders); schema v5 / letter v4.

## 0.8.0 (Phase 6.1)
Style tab and button, click-to-style, Format text (font, boldness, size, colour, capitals, italic, spacing, alignment), bundled fonts, photo size and nudge.

## 0.7.x (Phase 6)
First-run tour, keyboard shortcuts, skeletons, per-section "to check" badges, transitions that respect reduced motion.

## 0.6.x (Phase 5 / 5.1)
Cover letters with all templates; text and fill colours, transparency, flip layout, date side.

## 0.5.x and earlier (Phases 1 to 4, 3b)
PWA shell and offline, resume editor with autosave, fifteen templates, print to PDF, JSON backup and restore, crash recovery.
