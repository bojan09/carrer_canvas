/* CareerCanvas service worker.
 * - App shell is precached and served cache-first so the app opens offline.
 * - A new worker waits until the page asks it to take over (no surprise reloads,
 *   no data loss).
 * - Only same-origin GET requests are handled. User documents are never cached here;
 *   they live in IndexedDB.
 * Keep CACHE_VERSION in sync with js/config.js APP_VERSION (tests enforce this).
 */
const CACHE_VERSION = "0.6.0";
const CACHE_PREFIX = "careercanvas-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const PRECACHE = [
  "./",
  "index.html",
  "offline.html",
  "manifest.webmanifest",
  "css/tokens.css",
  "css/base.css",
  "css/layout.css",
  "css/components.css",
  "css/motion.css",
  "css/print.css",
  "css/offline.css",
  "css/pages/home.css",
  "css/pages/templates.css",
  "css/pages/settings.css",
  "css/pages/placeholder.css",
  "css/pages/editor.css",
  "css/pages/saved.css",
  "css/templates/doc.css",
  "css/templates/stage.css",
  "css/templates/summit.css",
  "css/templates/grid.css",
  "css/templates/aurora.css",
  "css/templates/velo.css",
  "css/templates/slate.css",
  "css/templates/bloom.css",
  "css/templates/vertex.css",
  "css/templates/nexus.css",
  "css/templates/prism.css",
  "css/templates/orbit.css",
  "css/templates/glass.css",
  "css/templates/bento.css",
  "css/templates/horizon.css",
  "css/templates/swiss.css",
  "css/templates/mono.css",
  "css/templates/letter.css",
  "js/models/cover-letter.js",
  "js/editors/resume-adapter.js",
  "js/editors/letter-adapter.js",
  "js/editors/letter-hints.js",
  "js/models/sample-photo.js",
  "js/editors/design-panel.js",
  "js/editors/photo.js",
  "js/editors/photo-controls.js",
  "js/preview/paper.js",
  "js/preview/thumb.js",
  "js/templates/registry.js",
  "js/templates/design.js",
  "css/print-page.css",
  "js/export/print.js",
  "js/export/backup.js",
  "js/export/backup-ui.js",
  "js/export/download.js",
  "js/editors/print-dialog.js",
  "js/state/shadow.js",
  "js/theme-boot.js",
  "js/main.js",
  "js/config.js",
  "js/routes.js",
  "js/router.js",
  "js/state/settings.js",
  "js/components/nav.js",
  "js/components/toast.js",
  "js/components/dialog.js",
  "js/components/install-card.js",
  "js/components/placeholder.js",
  "js/components/template-card.js",
  "js/pages/home.js",
  "js/pages/resume.js",
  "js/pages/cover-letter.js",
  "js/pages/templates.js",
  "js/pages/saved.js",
  "js/pages/settings.js",
  "js/pages/not-found.js",
  "js/pwa/register.js",
  "js/pwa/install.js",
  "js/utils/dom.js",
  "js/utils/platform.js",
  "js/components/announcer.js",
  "js/editors/bullets.js",
  "js/editors/fields.js",
  "js/editors/hints.js",
  "js/editors/section-forms.js",
  "js/editors/sections-rail.js",
  "js/editors/sortable.js",
  "js/editors/studio.js",
  "js/models/resume.js",
  "js/models/section-defs.js",
  "js/preview/render.js",
  "js/state/history.js",
  "js/state/resume-store.js",
  "js/state/save-queue.js",
  "js/storage/idb.js",
  "js/storage/memory.js",
  "js/storage/migrations.js",
  "js/storage/repository.js",
  "js/utils/sanitization.js",
  "js/utils/validation.js",
  "assets/icons/favicon.svg",
  "assets/icons/favicon-32.png",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-192.png",
  "assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // cache: "reload" bypasses the HTTP cache so a new version never precaches stale files
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })))),
  );
  // No skipWaiting() here: the page decides when to activate (see SKIP_WAITING message).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: the whole app is one document (hash routing).
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const shell = (await cache.match("index.html")) || (await cache.match("./"));
        if (shell) return shell;
        try {
          return await fetch(request);
        } catch {
          return (await cache.match("offline.html")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first, then network, refreshing the cache in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
