# Roadmap and backlog

## Next: Phase 7, quality gate and shipping
Phases 3b, 5, 5.1 and 6 are done, see PHASE_STATUS.md. Needs real devices: Safari, Firefox, iOS, Android, screen readers, Lighthouse.

## Later
- Phase 5: cover letters (reuse template identity, print and backup support).
- Phase 6: interaction polish (gallery card motion, guided tour, shortcuts, skeletons).
- Phase 7: quality gate: real-device/browser matrix (Safari, Firefox, iOS, Android), Lighthouse, screen-reader pass, deployment notes.

## Known technical debt
- Photo data is embedded in the resume record and in every undo snapshot.
- No cross-tab editing protection (last write wins).
- No real-device verification yet for install, photo picking, printing or file download on iOS.
