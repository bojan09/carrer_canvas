# Design system (Phase 1)

- Tokens live in `css/tokens.css`: dark default, light theme via `data-theme`, OS-following "system" option, reduced motion via `data-motion` or `prefers-reduced-motion`.
- App chrome (header, hero, bottom nav) is always dark navy/indigo; the interface theme affects content areas. Resume template colours will be independent.
- Palette: `#091226 #101B36 #182347`, accent `#536BFF`, violet `#9747FF`, cyan `#37C8F7`. Accent *text* uses lighter/darker variants to keep contrast.
- Fonts: system stacks only (no remote or bundled fonts yet), so offline and licensing are trivially safe. A bundled open-licence face can be added later.
- Motion: 150/240/380ms with `cubic-bezier(0.2,0.8,0.2,1)`.
- Departures from the concept image (deliberate, per the product spec): no hiring promises in copy, no fabricated metric widgets or skill meters, no photo, no "DOCX coming soon", no "Most Popular" badge, initials avatar instead of a stock headshot.
- Template thumbnails on Home/Templates are CSS-drawn placeholders, not real renders. Real previews arrive in Phase 3.
