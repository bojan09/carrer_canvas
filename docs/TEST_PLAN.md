# Test plan

Automated (run): `npm test` (structure, versions, precache, manifest, CSP-safety), `npm run e2e` (Chromium: console errors, external requests, SW control, offline reload and routing, theme persistence, filtering, 5 viewport widths for overflow).

Manual, **not yet done**: real Android install, real iOS Add to Home Screen + standalone + splash, Safari/Firefox, Lighthouse PWA/accessibility, screen-reader pass, contrast audit of every state, landscape phones, update-while-open flow with a real version bump.

Phase 2 adds `tests/phase2.test.mjs` (29 total unit/structure tests) and `e2e/phase2.mjs`. Manual, not yet done: iOS/Android editing with the on-screen keyboard, drag-and-drop with a mouse, two tabs on one document, storage-quota exhaustion in a real browser, screen-reader pass of the editor.

Phase 3 adds `tests/phase3.test.mjs` (43 unit/structure tests in total) and `e2e/phase3.mjs`: gallery thumbnails/preview/use-template, content preserved across all eight templates, long-content overflow checks per template, design controls and persistence, simplified layout, ATS structure rules for Summit/Grid, photo handling, zoom, paper size, print-media colour fallbacks, mobile Design/Preview tabs. Manual, not yet done: real print/PDF output in each browser, screen-reader pass of the design panel, real-device photo picking (camera/HEIC), contrast audit of every template at every accent.

Phase 4 adds `tests/phase4.test.mjs` (57 unit/structure tests in total) and `e2e/phase4.mjs` (101 checks incl. real PDFs; needs poppler-utils). Manual, not yet done: printing in Safari, Firefox and on iOS/Android, opening generated PDFs in common viewers, file download/share on iOS (including the installed app), screen-reader pass of the export and restore dialogs, very large backups.

## Phase 5 (cover letters)
- `tests/phase5.test.mjs`: model, normalisation and hostile input, migrate routing, consent-based copy, checklist logic, backup/import/shadow with letters, file names.
- `e2e/phase5.mjs`: create, edit every part, reload, undo/redo, checklist, all 15 templates render a letter, photo, copy from resume (resume unchanged, undoable), route guards, Saved list (filter, rename, duplicate, delete), newer-version record, backup wipe and restore, real PDFs for all 15 templates (one-page and multi-page letters: no clipped text, margins, no stranded date/subject/greeting/closing, closing with signature), dark template prints on white, export dialog, 320/390px overflow.

## Phase 5.1 (colour, transparency, layout)
- `tests/phase51.test.mjs`: override validation (hostile values), defaults, template-switch clearing, colour maths (`readableInk`, `effectiveFill`), registry flag consistency, schema bump migrations, round trips for resumes and letters.
- `e2e/phase51.mjs`: real design panel on resumes and letters (live preview, reset, undo, reload persistence, contrast warning, header text adapting to a fill, disabled controls with reasons), flip layout geometry for all 13 flippable templates (photo or sidebar crosses the page centre, no overflow, same reading order), real PDFs (custom colour prints; dark templates print dark on white; flipped header and sidebar print correctly; right-aligned date; faded fills), 320/390px.

## Phase 6 (polish)
- `tests/phase6.test.mjs`: tour steps well formed and wired to real `data-tour` attributes, shortcut list has no duplicates and every listed shortcut exists in the code, skeleton timing (fast never shows, slow shows once, cancel), settings flag and Reset behaviour, precache list.
- `e2e/phase6.mjs`: tour (appears once, keyboard path, fits and does not cover its target, Esc/Skip, Settings replay), shortcuts (? , typing safety, Alt+1/3, Ctrl+S), undo toast restores, reorder and insert transitions run and settle with no leftover transform, Reduced motion (in-app and OS) removes them, section badges, skeleton with an artificially slow database, offline/online messages, update state row, gallery hover, 9 viewport sizes (320x568 to 1440x900, 667x375 and 844x390 landscape) for overflow, tour fit and dialog fit, phone tap targets.
- Earlier suites set the tour as seen (their own concern); toolbar Undo is selected by `aria-label` because toasts now also contain an Undo button.

## Phase 6.2 (limits fixed: styles survive template switches, real italics, non-Latin fonts, movable blocks)
- `tests/phase62.test.mjs`: move validation (ids, clamping, rounding, cap), round trips, template switch drops moves, migrations 4->5 and 3->4, font files exist with italic and Cyrillic and are precached, build script and sw markers.
- `e2e/phase62.mjs`: styles carry over a template switch (and only the colour is dropped light to dark, with Undo), real italic embedded, Macedonian/Greek/Latin-extended text printed in the chosen font (checked with Chrome's platform-font report and pdffonts), mouse drag moves a block by the dragged distance, nudge arrows, Shift steps, sliders, section and letter blocks, Undo/Redo, persistence, simplified mode ignores moves, PDF position of a moved block within 2 pt, same page count, no leaked outlines.

## Phase 6.1 (Style tab, click-to-style, Format text)
- `tests/phase61.test.mjs`: element validation including hostile values, photo limits, round trips, migration, template-switch reporting, bundled fonts (stack, @font-face, file, OFL licence, precache), elements.css covers every role x property, renderer only uses known roles.
- `e2e/phase61.mjs`: Style tab and button are findable (name, icon, New badge, hint), click-to-pick on resumes and letters, every Format control (font, boldness, size, colour, capitals, italic, spacing, alignment incl. flex contact line), resets, undo, reload, panel groups and jump chips, template-switch toast with Undo, photo size and nudge, real PDFs (bundled fonts embedded, custom colour prints, dark templates keep readable text), no third-party requests, 320/390px.


## Phase 7 acceptance matrix
Status is "Passed" only if executed in this repository's environment (Chromium 141 via Playwright, Linux). Everything else is Unverified.

| Check | Status | Evidence |
| --- | --- | --- |
| Viewports 320, 360, 390, 430, 768, 1024, 1440 and landscape 844x390, 667x375, on 8 routes: no sideways scroll, no clipped buttons | Passed | `e2e/phase7.mjs` |
| axe-core WCAG 2.2 A/AA + best practice, light and dark, 10 views (incl. both Style panels): no serious or critical findings | Passed (after fixes in 0.9.1) | `e2e/phase7.mjs` |
| Lighthouse accessibility / best practices / SEO | 100 / 100 / 100 on Home and Templates | run by hand, see LIMITATIONS.md |
| Lighthouse performance (mobile, throttled, local) | 78 Home, 92 Templates | LIMITATIONS.md |
| Reduced motion | Passed (no looping animations, instant transitions) | `e2e/phase7.mjs` |
| Keyboard only: Tab reaches controls, no trap, focus indicator on every stop | Passed (Home, Settings, editor) | `e2e/phase7.mjs` |
| Forced colours (high contrast) | Partly: Style button visible and distinct only | `e2e/phase7.mjs` |
| Light / dark / system | Passed (axe in both; theme persistence in phase 1) | phases 1 and 7 |
| Offline reload after an online visit | Passed | phase 1 |
| Update with unsaved typing: announced, not auto-applied, saved before reload, new cache active | Passed | `e2e/phase7b.mjs` |
| PWA install on Android / iOS | Unverified | needs devices |
| JSON backup round trip, invalid file, newer-version records | Passed | phase 4, 5 |
| Storage quota exceeded while typing | Passed (status says "Couldn't save", Retry shown, text kept) | `e2e/phase7b.mjs` |
| IndexedDB blocked | Passed (warning banner, editor still works) | phase 2 |
| One page, two page, long multi-page resume; A4 and Letter | Passed (6 pages, no blank page, correct paper size) | phase 4, `e2e/phase7b.mjs` |
| Cover letter print | Passed | phase 5 |
| Empty, partial, fictional sample | Passed | phases 2 to 5 |
| Special Unicode (Latin-ext, CJK, Arabic, emoji), bidi override stripped | Passed in Chromium; CJK font availability depends on the device | `e2e/phase7b.mjs` |
| Malicious text in fields and backups | Passed | phases 2, 4, 5, 7b |
| Long URL (300 characters) | Passed (wraps, one page) | `e2e/phase7b.mjs` |
| Firefox, Safari, Edge, mobile Safari, mobile Chrome (real) | Unverified | needs browsers and devices |
| Screen reader spot checks | Unverified | needs NVDA / VoiceOver / TalkBack |
| Deployment to Vercel | Not done | docs/DEPLOYMENT.md |
