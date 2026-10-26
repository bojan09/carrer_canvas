# Roadmap and backlog

## Next: Phase 5, cover letters
Phase 3b (template refresh) is done, see PHASE_STATUS.md.

## Later
- Phase 5: cover letters (reuse template identity, print and backup support).
- Phase 6: interaction polish (gallery card motion, guided tour, shortcuts, skeletons).
- Phase 7: quality gate: real-device/browser matrix (Safari, Firefox, iOS, Android), Lighthouse, screen-reader pass, deployment notes.

## Known technical debt
- Photo data is embedded in the resume record and in every undo snapshot.
- No cross-tab editing protection (last write wins).
- No real-device verification yet for install, photo picking, printing or file download on iOS.
