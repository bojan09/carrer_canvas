# PWA & offline

## Install support
| Platform | Mechanism | Status |
|---|---|---|
| Android Chrome / Edge / Samsung Internet | `beforeinstallprompt` captured at load, shown as an **Install app** button only when the browser offers it; manual steps dialog otherwise | Implemented; **not yet tested on a real device** |
| iPhone / iPad (Safari, iOS 16.4+ other browsers) | No install API. Settings and Home show a **How to install** dialog (Share → Add to Home Screen). `apple-touch-icon` (180px, opaque), `apple-mobile-web-app-*` meta tags, 12 portrait splash images, safe-area CSS | Implemented; **not yet tested on a real device** |
| Desktop Chromium | Same prompt as Android; manual instructions elsewhere | Implemented |

No fake install button: it only appears when the browser exposes a prompt.

## Service worker (`sw.js`)
- Install: precaches the app shell into `careercanvas-shell-<version>` (bypassing the HTTP cache).
- No `skipWaiting()` on install. When a new worker is waiting, the page shows a persistent "new version" toast; **Reload** posts `SKIP_WAITING`, then the page reloads on `controllerchange`. `onBeforeUpdateReload()` in `js/pwa/register.js` is the hook later phases use to flush unsaved edits first.
- Activate: deletes only older `careercanvas-shell-*` caches, then claims clients.
- Fetch: same-origin GET only. Navigations get the cached `index.html` (hash routing means one document). Other assets are cache-first.
- User documents are never cached here (they will live in IndexedDB).

## iOS specifics to be aware of
- Home Screen apps have storage separate from Safari tabs. Install first, then create documents.
- iOS may evict storage for rarely used web apps. JSON backup (Phase 4) is the mitigation; Settings → Storage lets users request persistence where supported.
- Status bar style is `black-translucent`; the header is always dark navy so status bar text stays readable in both themes.
- Splash images are provided for common portrait sizes only. Other devices fall back to the manifest background colour.
