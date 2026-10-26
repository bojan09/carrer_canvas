# Exact limitations

Written from what was tested, not from what is hoped. "Unverified" means no one has run it.

## Not verified (no access in the build environment)
- **Browsers:** Safari (macOS, iOS), Firefox, Edge, Samsung Internet. Only Chromium (desktop, emulated phone sizes) was run. Firefox and WebKit could not be downloaded here.
- **Real devices:** install to the Home Screen on iOS and Android, standalone mode and splash, on-screen keyboard behaviour, photo picking from the camera roll, file download of backups, touch drag and print on phones and tablets.
- **Screen readers:** NVDA, JAWS, VoiceOver and TalkBack were not used. Automated axe-core checks and keyboard-only checks were run; they find roughly a third of accessibility problems, not all.
- **CSS features on older browsers:** `translate`, `overflow: clip`, `color-mix`, `mask`, variable fonts. Moved blocks and some fills may not render on browsers older than roughly 2022.
- **Deployment:** nothing is deployed. `vercel.json` headers were read, not exercised on Vercel.
- **Print:** Safari and Firefox print engines; Ctrl/Cmd+P (as opposed to the Export PDF button) when fonts for the document have not loaded yet.

## Product limits
- **PDF** is the browser's Print to PDF. Page breaks are decided by the browser; the preview's page guides are estimates. No DOCX export.
- **Storage** is IndexedDB in this browser profile. Clearing site data, private windows, or browser storage eviction can delete documents. JSON backup exists; there is no sync. On iOS an installed Home Screen app has storage separate from Safari. No cross-tab edit protection (last write wins).
- **ATS:** no tool here can promise ATS results. Templates marked ATS-conscious are plain single-column text; others are decorative. Moved blocks may be read in a different order by scanners (Chrome paints a moved block last); Simplified mode ignores moves.
- **Moving blocks** shifts the drawing, not the layout: blocks can overlap and a block pushed below the last page can add a page. No free-form resizing of blocks. Touch uses arrows and sliders, not drag.
- **Fonts:** Latin, Latin-extended, Cyrillic, Greek and Vietnamese are bundled. Space Grotesk has no italic (slanted by the browser) and no Cyrillic or Greek (bundled Inter is used). Arabic, Hebrew, Indic and CJK text uses system fonts, so its look depends on the device.
- **Sanitisation** strips control characters and bidirectional override characters from text on purpose.
- **Photos** are resized and stored in the document; they appear in undo history, so many photo changes use extra memory.
- **Offline cache** is about 2.1 MB (fonts about 1.6 MB, fetched per script on demand but all precached).

## Measured performance (Lighthouse 13, mobile preset with simulated throttling, local uncompressed server)
- Home: performance 78, accessibility 100, best practices 100, SEO 100 (LCP 4.2 s, CLS 0, TBT 140 ms).
- Templates: performance 92, accessibility 100, best practices 100, SEO 100.
- Known causes: 34 separate render-blocking CSS files and an unminified local server. Hosting with HTTP/2 and compression should help; this was not measured. There is no build step by design, so CSS is not bundled or minified.
