# CareerCanvas

Free, private, offline-capable resume and cover-letter builder. Vanilla HTML, CSS and JavaScript (ES modules). No framework, no build step, no backend, no accounts, no trackers.

**Status:** Phase 1 of 7 (app shell, design system, PWA). See [docs/PHASE_STATUS.md](docs/PHASE_STATUS.md).

## Run locally

Service workers need `http://localhost` or HTTPS, so open the files through a server, not `file://`.

```bash
npm run serve        # http://localhost:4173 (zero-dependency static server)
npm test             # unit/structure tests (Node 20+)
NODE_PATH=<dir containing playwright> npm run e2e   # browser checks + screenshots (needs Playwright + Chromium)
```

## Structure

```
index.html            App document (single page, hash routing)
manifest.webmanifest  PWA manifest
sw.js                 Service worker (must live at the root for full scope)
offline.html          Fallback if the shell was never cached
vercel.json           Static hosting headers (CSP, SW no-cache)
css/                  tokens, base, layout, components, motion, print
  pages/              Per-page styles
js/
  main.js             Bootstrap
  router.js, routes.js  Hash router and route table
  config.js           App name/version (keep in sync with sw.js)
  theme-boot.js       Pre-paint theme application (no flash)
  state/              Settings store
  components/         Nav, toast, dialog, install card, template cards
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

- PDF output will use the browser's Print → Save as PDF. There is no custom PDF engine and no DOCX export.
- Documents will live in browser storage. Clearing site data or private browsing can remove them; JSON backup is planned.
- On iOS, an installed Home Screen app has storage separate from Safari.
