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
