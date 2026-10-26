# Phase status

Latest: **Phase 4 implemented** (below). Earlier phases follow. Requested next: Phase 3b template refresh, see ROADMAP.md.

## Phase 4: Print-to-PDF, backup/restore, reliability — implemented (v0.4.0)

### Scope finished
- **Print-to-PDF** via the browser print engine (docs/PRINT_EXPORT.md): Export PDF button + review dialog (checklist, paper/margins/length, steps, per-browser tips, optional print-only simplified layout, "skip next time"), Ctrl/Cmd+P support, per-resume `@page` size and margins through CSSOM, white-paper fallbacks, single-column print for sidebar templates, page-break guards, file name from the person's name. No claim of direct PDF generation; no DOCX.
- **Backup/restore**: versioned JSON (`format: 1`), sensitive-data warning, photos only if ticked, single-document or all-documents export, validated import with preview, per-document rejection reasons, keep-both / replace / skip, last-backup time. Entry points: Settings and Saved.
- **Draft recovery**: synchronous shadow copy when the tab is hidden with a save pending; newer valid shadow is offered on next open (undoable), never applied silently.
- **Settings**: default paper size (locale default: Letter for US/CA, else A4), PDF review toggle, backup/restore, storage and delete-all.
- Fixed along the way: list bullets had no markers (selector specificity), `beforeprint` clobbering an explicit print preparation, a missing import caught by a new guard test, dark colour scheme leaking into the page margin of PDFs.

### Executed checks (results)
- `npm test`: 57/57 pass (backup build/parse/plan, hostile imports, filename/@page helpers, shadow validity/failure handling, page-module import guard).
- `e2e/phase4.mjs`: 101 checks pass, three consecutive runs, including **real PDFs** for all 8 templates (3 pages each, A4, selectable text, margins respected on every page, no stranded headings, no UI text), Letter + 25 mm margins, photo present only when enabled, dark templates on white with backgrounds off, sidebar content printed after main content, export dialog flow, backup/restore round trip after a full wipe, duplicate strategies, hostile/newer/damaged files, crash recovery, default paper size, 320/390 px overflow.
- `e2e/phase1.mjs`, `phase2.mjs`, `phase3.mjs` still pass (Phase 3 test made locale-independent).
- Screenshots reviewed by eye: export dialog, PDF pages for Aurora and Vertex.

### Not verified
- **Safari, Firefox, iOS, Android printing** (Chromium only here). **Download/share of files on iOS**, including the installed app. Opening PDFs in other viewers. Screen-reader pass of the new dialogs.

### Known limitations
- Page-break guides in the preview remain estimates; the PDF is the source of truth.
- Safari ignores `@page size`.
- Backup is manual; there is no automatic reminder beyond showing the last backup time.
- Shadow copies live in localStorage (about 5 MB shared), so a very large photo-heavy document may not fit.

### Handoff
Next: **Phase 3b template refresh** (10 modern templates, profile photo in every sample, see docs/ROADMAP.md), then Phase 5 cover letters. Do not start until approved.

---

## Phase 3: Templates, live paper preview, design customization — implemented (v0.3.0)

### Scope finished
- Eight genuinely different templates (Aurora, Summit, Velo, Slate, Bloom, Grid, Vertex, Nexus) from one canonical renderer + per-template CSS; registry holds layout, sidebar sections, photo support, layout warnings and defaults (`js/templates`, `css/templates`).
- Gallery with real, locally rendered thumbnails, category filters, preview dialog (layout notes), and **Use template** that applies to the last-opened resume without touching content (or starts a new blank resume).
- Editor Design tab: template picker, Simplified (ATS-conscious) layout, accent swatches + custom colour with contrast warning, four font pairings, name/text size, line spacing, section spacing, margins, divider style, header alignment (locked where a template fixes it, with an explanation), paper size, reset to template defaults. Every change is undoable and persists.
- Paper preview at real A4/Letter size with Fit width / Fit page / 75–125% zoom (default stored in Settings), estimated page-break guides and page count, template-switch crossfade.
- Photo controls live in **Personal Info** (and the Design tab). Summit and Slate can show an opt-in photo (Summit warns it is less plain for applicant systems); Grid and the Simplified layout never do.
- Optional photo: opt-in, centre-cropped and re-encoded to a small JPEG (EXIF dropped), stored locally, hidden until "Show photo" is on, never shown by ATS/executive layouts or Simplified layout, clear warning copy.
- Schema v2 with migration; older app versions refuse v2 records instead of dropping photos.
- Mobile: Edit / Preview / Design bottom tabs; Design panel and gallery verified at 390px.

### Executed checks (results)
- `npm test`: 43/43 pass (registry rules, design clamping, simplified/photo rules, applyTemplate, contrast, photo normalisation, v1→v2 migration, future-version refusal).
- `e2e/phase3.mjs` (Chromium): all checks pass, including content preserved across all 8 templates, no overflow with very long/unbroken text on all 8, preview stays fitted after switching, design controls persist across reload, Summit/Grid structure (single column, no images, real headings, no pseudo-element content), photo opt-in flow, dark templates print on white, mobile tabs.
- `e2e/phase1.mjs` and `e2e/phase2.mjs` still pass (selectors updated for the new preview).
- Every template was reviewed by eye at natural size; the gallery at 1500 and 390 and the Design panel at 1500 and 390 were reviewed in screenshots.

### Bugs found and fixed during this phase
- Hero mock classes (`.doc*`) collided with the real document classes; renamed to `.mock*`.
- Template-switch animation overrode the preview zoom (animated `transform`); now animates opacity and the individual `scale` property.

### Not verified
- Real print/PDF output (Phase 4), Safari/Firefox rendering of `color-mix`, `:has()` and `inert` (all need recent browsers: iOS 16.4+), real-device photo picking (camera, HEIC), screen reader pass, contrast of every template at every accent.

### Known limitations / technical debt
- Page-break guides are estimates; pagination is decided by the print engine (Phase 4).
- Print rules for dark/ink-heavy templates exist but are only probed, not yet tested through a real print dialog.
- Photos are embedded in the resume record (≤ ~110 KB) and in every undo snapshot.
- System fonts only, so typography varies by OS.
- Simplified layout borrows Summit's structure for every non-ATS template (by design, but it drops the template's identity).
- Aurora/Velo move Skills, Languages, Certifications into the sidebar, so their DOM reading order differs from the section order shown in the editor.

### Handoff
Phase 4: print-to-PDF workflow (`@page` size/margins per paper size, break guards, preflight checklist, instructions), JSON backup/restore (photos only when selected), draft recovery warnings, cross-browser testing. Reuse `renderResume()` and the `.doc` tree for print; do not start until approved.

---

## Phase 2: Resume schema, editor, local autosave — implemented (v0.2.0)

### Scope finished
- Versioned schema + normaliser + migration chain (`js/models`, `js/storage/migrations.js`); see `docs/DATA_SCHEMA.md`.
- IndexedDB repository with in-memory fallback and explicit warnings (`js/storage`).
- Serialised, debounced autosave with failure retry; flushed on tab hide, page hide, route change and before an app-update reload (`js/state/save-queue.js`, `resume-store.js`).
- Undo/redo with typing coalescing (`js/state/history.js`); Undo/Redo buttons plus Ctrl/Cmd+Z / Shift+Z / Y outside text fields.
- Editor studio (`js/editors`): Personal Info + links, Summary, Experience, Education, Skills, Projects, Certifications, Languages, custom sections; repeatable entries with duplicate/delete (confirmed), bullets, current-role checkbox, inline advisory validation, writing hints, show/hide, reordering by up/down buttons (keyboard/touch/screen reader) and mouse drag, announcements via a live region.
- Basic semantic preview (`js/preview/render.js`, textContent only, http(s)-only links) as the base for Phase 3 templates; local, non-AI writing checklist (`js/editors/hints.js`).
- Saved dashboard (open, rename, duplicate, delete with confirmation), Resume start screen (blank / fictional sample), Settings storage rows and double-confirmed "Delete all documents".
- Responsive: three panes at 1360px+, two at 1100px+, Edit/Preview bottom tabs below, Sections dialog where the rail is hidden.

### Executed checks (results)
- `npm test`: 29/29 pass (schema, normalisation, migrations incl. newer-version refusal, history, save-queue ordering/failure/retry, sanitisation, validation, checklist, memory store).
- `e2e/phase2.mjs` (Chromium): all checks pass: create/edit/reload persistence, bullet reorder by keyboard with focus retention, undo/redo, edit-then-navigate not lost, hostile markup inert and `javascript:` links not rendered, section reorder/hide/custom section, sample warnings, checklist, duplicate/rename/delete, delete-all double confirmation, storage-unavailable fallback, newer-version record left untouched, no console errors, no overflow at 320px.
- `e2e/phase1.mjs` still passes.
- Screenshots reviewed by eye at 1440 (editor, saved) and 390 (editor).

### Not verified
- Real devices (iOS/Android), Safari/Firefox, screen readers, Lighthouse, contrast audit of new screens, drag-and-drop by mouse (implemented, not automated), landscape phones, quota-exceeded in a real browser (covered by unit test only).

### Known limitations / technical debt
- Two tabs editing one resume: last write wins (no cross-tab sync yet).
- Undo history is per editing session and is not saved.
- `<input type="month">` falls back to plain text in desktop Safari/Firefox; the YYYY-MM format hint and validation cover it.
- Writes are asynchronous: on abrupt tab kill the last ~600 ms of typing can be lost (flush runs on hide/pagehide, which is best effort).
- Preview is a plain page, not paper-accurate. Mobile editor top bar scrolls away (not sticky) below 1100px.
- Section ordering by drag is mouse-only; keyboard and touch use buttons.
- Photo, template selection and design settings are schema placeholders until Phase 3. Backup/restore is Phase 4.

### Handoff
Phase 3: eight templates, paper-sized preview with zoom, gallery "Use template", design controls, Design tab, optional photo. Reuse `renderResume()` as the canonical content tree; add per-template CSS in `css/templates/`. Do not start until approved.

---

## Phase 1: Foundation, design system, navigation, PWA — implemented

### Scope finished
- App shell: sticky dark header, desktop nav, mobile bottom nav, footer, hash router with focus management and route announcements, skip link.
- Design system: tokens, light/dark/system themes (no flash), reduced-motion support, buttons, chips, segmented controls, cards, badges, native-`<dialog>` modals, toasts, empty states.
- Pages: Home (landing, closely following the concept's hero/feature row/layered sample documents), Templates (8-template gallery shell with working category filter, previews marked as Phase 3), Settings (theme, motion, install, offline/update status, storage estimate and persistence request, reset), placeholders for Resume (Phase 2), Cover Letter (Phase 5) and Saved (Phase 2), 404.
- PWA: manifest (any + maskable icons, shortcuts, screenshots), service worker with versioned precache and user-controlled updates, offline fallback, Android install prompt handling, iOS install guidance + meta tags + splash images.
- Hosting: `vercel.json` with CSP and SW no-cache headers.

### Executed checks (results)
- `npm test`: 7/7 pass.
- `npm run e2e` (Chromium via Playwright): all checks pass, including SW control, offline reload, offline navigation to `/templates` and `/settings`, 8 template cards, Tech filter = 2, light-theme persistence, manifest, no console errors, zero external requests, no horizontal overflow at 320/390/768/1024/1440.
- Screenshots reviewed by eye at 1440 and 390 widths (home) and 1440 (settings).

### Not verified
- Real Android and iOS devices, Safari, Firefox, Lighthouse, screen readers, full contrast audit, reduced-motion visual check, update-flow with a real version bump.

### Known limitations
- No editor, templates, storage, export yet (by design: Phases 2-4).
- System font stack, so typography differs per OS.
- iOS splash images cover common portrait sizes only.

### Departures from the reference image
See `docs/DESIGN_SYSTEM.md`.

### Handoff
Phase 2: versioned resume schema, IndexedDB repositories + migrations, section editors, autosave, undo/redo, Saved dashboard. Use `onBeforeUpdateReload()` to flush pending saves. Do not start until approved.
