# Test plan

Automated (run): `npm test` (structure, versions, precache, manifest, CSP-safety), `npm run e2e` (Chromium: console errors, external requests, SW control, offline reload and routing, theme persistence, filtering, 5 viewport widths for overflow).

Manual, **not yet done**: real Android install, real iOS Add to Home Screen + standalone + splash, Safari/Firefox, Lighthouse PWA/accessibility, screen-reader pass, contrast audit of every state, landscape phones, update-while-open flow with a real version bump.
