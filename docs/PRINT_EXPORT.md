# Print and PDF export

**CareerCanvas does not generate PDFs itself.** It prepares the resume for the browser's print engine, and the user chooses *Save as PDF*. No DOCX export exists.

## How it works
1. **Export PDF** (editor top bar) flushes pending saves, optionally shows the review dialog (checklist, paper/margins/length, browser-specific steps), then calls `window.print()`.
2. `js/export/print.js` draws the canonical `renderResume()` tree into `#print-root`, sets `body[data-print="resume"]`, names the document `"<Name> - Resume"` (browsers use the title as the suggested file name) and writes `@page { size: A4|letter; margin: <design margins>mm }` into the print-only stylesheet through CSSOM (CSP-safe). `css/print-page.css` holds a static default if the browser refuses.
3. `css/print.css` hides every other surface, forces a light colour scheme (so a dark UI theme can never reach paper or the page margin), removes preview scaling and padding (margins come from `@page`, so **every** page has real margins), and adds break guards.
4. Ctrl/Cmd+P and the browser menu also work: `beforeprint` prepares the open resume. A preparation made by the Export button is kept (so print-only options survive) for up to 60 s.

## Print rules
- Page breaks: headings never end a page (`break-after: avoid`), entries, bullets, skill groups and language lines do not split (`break-inside: avoid`), orphans/widows 3.
- Sidebar templates (Aurora, Velo) print as **one content-complete column**: header, main sections, then the sidebar sections. Vertex sections drop the gutter layout. Nexus cards clone their borders across page breaks.
- Dark/ink-heavy designs (Slate, Aurora, Vertex header, Bloom tint, Nexus tint) print on white. This is tested with background graphics **off**, the browsers' default.
- A print-only **simplified layout** option in the review dialog prints any template in the plain single-column style without changing the saved design.
- Photos print only if the user enabled "Show photo" and the layout supports photos (never Grid or the simplified layout).
- Text stays real, selectable text. Links are real links.

## Known browser differences (honest list)
- **Safari** ignores `@page size`; the user picks paper size in the dialog. Margins are honoured in recent versions. Unverified here.
- **Firefox**, **Safari** and mobile browsers were **not** tested; only Chromium's print engine was (via real generated PDFs).
- iOS/iPadOS has no "Save as PDF" button: pinch-out on the print preview, then Share, then Save to Files. Printing from an installed Home Screen app is unverified.
- Pagination can differ slightly between browsers. The preview's page guides are estimates.

## Verification
`e2e/phase4.mjs` generates real PDFs for all eight templates with Chromium (`page.pdf`, backgrounds off) and checks with poppler: page count and A4/Letter size, selectable text for every section, no UI text in the PDF, minimum margins on **every** page (word bounding boxes), no stranded headings, dark templates printing on white, sidebar content present after the main content, photo present/absent rules, and US Letter with custom margins.
