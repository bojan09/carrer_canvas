# CareerCanvas

Free, private, offline-capable resume and cover-letter builder. Vanilla HTML, CSS and JavaScript (ES modules). No framework, no build step, no backend, no accounts, no trackers.

**Status:** Phase 6.2 (styles survive template switches, real italics, Cyrillic/Greek fonts, movable blocks), Phase 6.1 (Style tab, click-to-style, per-element fonts, colours and sizes) and Phase 6 of 7 (interaction polish) on top of Phase 5.1 colour/transparency/layout options and Phase 5 cover letters, plus the Phase 3b template refresh (PWA shell, resume editor with local autosave, fifteen templates with paper preview and design controls, matching cover letters, print-to-PDF, JSON backup and restore, crash recovery). The final quality pass (real devices, accessibility, deployment notes) is next, see docs/ROADMAP.md. See [docs/PHASE_STATUS.md](docs/PHASE_STATUS.md).

## Run locally

Service workers need `http://localhost` or HTTPS, so open the files through a server, not `file://`.

```bash
npm run serve        # http://localhost:4173 (zero-dependency static server)
npm test             # unit/structure tests (Node 20+)
NODE_PATH=<dir containing playwright> node e2e/phase1.mjs   # browser checks + screenshots (needs Playwright + Chromium)
NODE_PATH=<dir containing playwright> node e2e/phase2.mjs   # editor, storage and persistence checks
NODE_PATH=<dir containing playwright> node e2e/phase3.mjs   # templates, design controls, photo, zoom
NODE_PATH=<dir containing playwright> node e2e/phase4.mjs   # real PDFs (needs poppler-utils), backup/restore, recovery
```

## Structure

```
index.html            App document (single page, hash routing)
manifest.webmanifest  PWA manifest
sw.js                 Service worker (must live at the root for full scope)
offline.html          Fallback if the shell was never cached
vercel.json           Static hosting headers (CSP, SW no-cache)
css/                  tokens, base, layout, components, motion, print
  templates/          doc.css (shared) + one stylesheet per template
  pages/              Per-page styles
js/
  main.js             Bootstrap
  router.js, routes.js  Hash router and route table
  config.js           App name/version (keep in sync with sw.js)
  theme-boot.js       Pre-paint theme application (no flash)
  state/              Settings, open-document session, history, autosave queue
  components/         Nav, toast, dialog, install card, template cards
  models/             Resume schema, normaliser, section definitions
  storage/            IndexedDB + memory fallback, repository, migrations
  editors/            Studio, section forms, bullets, rail, checklist
  templates/          Template registry + design settings (pure data/logic)
  export/             Print/PDF preparation, JSON backup/restore, downloads
  preview/            Resume renderer, paper preview (zoom), thumbnails
  pages/              One module per route
  pwa/                Service worker registration, install handling
  data/, utils/
assets/               icons, iOS splash screens, manifest screenshots
scripts/              serve.mjs, generate-assets.mjs
tests/                node:test checks
e2e/                  Playwright checks
docs/                 Spec, design system, PWA notes, test plan, phase status
```

## Deploying (free static hosting, e.g. Vercel)

No build command, output directory is the repository root. `vercel.json` sets security headers and makes sure `sw.js` is never cached. Hash routing means no rewrites are needed.

When releasing a new version: bump `APP_VERSION` in `js/config.js`, `CACHE_VERSION` in `sw.js` and `version` in `package.json` (a test enforces they match), and add any new files to `PRECACHE` in `sw.js` (a test enforces this too).

## Honest limitations

- PDF output uses the browser's Print → Save as PDF. There is no custom PDF engine and no DOCX export. See docs/PRINT_EXPORT.md.
- Documents live in browser storage (IndexedDB). Clearing site data or private browsing can remove them; JSON backup is planned.
- On iOS, an installed Home Screen app has storage separate from Safari.
