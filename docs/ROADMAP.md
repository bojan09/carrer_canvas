# Roadmap and backlog

## Next: Phase 3b, template refresh (requested by the product owner)
- **Ten templates**, more modern than the first eight (current set is judged "very basic"). Aim for contemporary patterns: strong typographic scale, colour blocking, asymmetric layouts, timeline entries, tag/chip skills, monogram/photo treatments, tasteful use of accent shapes. Keep at least two genuinely plain ATS-conscious single-column options.
- **Every resume example includes a profile picture.** Gallery thumbnails, the hero mock-ups and `createSample()` should show a photo. Shipping stock photography is a licensing risk, so the plan is an **app-owned illustrated avatar** (SVG rendered to a small JPEG, committed as an asset) clearly labelled "Sample".
- Each new template needs: registry entry, stylesheet, print fallback, PDF verification (`e2e/phase4.mjs` loop), thumbnail, layout notes, tests.
- Re-check photo placement in every layout (circle/square/none) and the simplified layout.

## Later
- Phase 5: cover letters (reuse template identity, print and backup support).
- Phase 6: interaction polish (gallery card motion, guided tour, shortcuts, skeletons).
- Phase 7: quality gate: real-device/browser matrix (Safari, Firefox, iOS, Android), Lighthouse, screen-reader pass, deployment notes.

## Known technical debt
- Photo data is embedded in the resume record and in every undo snapshot.
- No cross-tab editing protection (last write wins).
- No real-device verification yet for install, photo picking, printing or file download on iOS.
