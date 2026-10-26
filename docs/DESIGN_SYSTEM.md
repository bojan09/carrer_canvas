# Design system (Phase 1)

- Tokens live in `css/tokens.css`: dark default, light theme via `data-theme`, OS-following "system" option, reduced motion via `data-motion` or `prefers-reduced-motion`.
- App chrome (header, hero, bottom nav) is always dark navy/indigo; the interface theme affects content areas. Resume template colours will be independent.
- Palette: `#091226 #101B36 #182347`, accent `#536BFF`, violet `#9747FF`, cyan `#37C8F7`. Accent *text* uses lighter/darker variants to keep contrast.
- Fonts: system stacks only (no remote or bundled fonts yet), so offline and licensing are trivially safe. A bundled open-licence face can be added later.
- Motion: 150/240/380ms with `cubic-bezier(0.2,0.8,0.2,1)`.
- Departures from the concept image (deliberate, per the product spec): no hiring promises in copy, no fabricated metric widgets or skill meters, no photo, no "DOCX coming soon", no "Most Popular" badge, initials avatar instead of a stock headshot.
- Template thumbnails on Home/Templates are CSS-drawn placeholders, not real renders. Real previews arrive in Phase 3.

## Resume templates (Phase 3)
- One canonical tree (`js/preview/render.js`) drawn by eight stylesheets (`css/templates/*.css`) on top of `doc.css`. DOM reading order is always header, main sections, sidebar sections; two-column templates use CSS grid areas, not reordered markup.
- Documents are laid out at real paper size in CSS px (A4 794x1123, Letter 816x1056) and scaled with a transform. Page-break guides are estimates from content height, not the browser's pagination.
- ATS-conscious design goal (Summit, Grid): single column, no images/icons, standard headings, nothing essential in pseudo-elements. The Simplified layout gives every other template the same structure while keeping accent, fonts and spacing.
- Dark/ink-heavy templates (Aurora, Slate, Vertex header, Nexus cards) carry `@media print` fallbacks to white; Phase 4 completes print behaviour.
- Fonts are system stacks (Clean Sans, Editorial, Classic Serif, Humanist), so appearance varies slightly by OS.
- Template thumbnails are real renders of fictional sample content.
