# Phase status

Latest: **Phase 2 implemented** (below). Phase 1 section follows it.

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
