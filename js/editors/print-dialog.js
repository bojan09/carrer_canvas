import { h } from "../utils/dom.js";
import { openDialog } from "../components/dialog.js";
import { getSettings, updateSettings } from "../state/settings.js";
import { getTemplate } from "../templates/registry.js";
import { resolveDesign } from "../templates/design.js";
import { analyze } from "./hints.js";

const BROWSERS = [
  ["Chrome, Edge, Brave (desktop)", "Press Ctrl/Cmd+P. Destination: Save as PDF. Under More settings set Margins to Default, turn Headers and footers off, and turn Background graphics on if your template uses colour."],
  ["Firefox (desktop)", "Print, then Destination: Save to PDF. Under Options turn Print backgrounds on if your template uses colour. Headers and footers should be off."],
  ["Safari (Mac)", "File, Print, then the PDF menu at the bottom left, then Save as PDF. Safari ignores the page size we set, so pick the paper size in the dialog."],
  ["iPhone and iPad", "In the print preview, pinch outward on the page preview, then tap Share and choose Save to Files. Browser support for printing from an installed Home Screen app can vary."],
  ["Android (Chrome)", "In the print screen choose Save as PDF as the printer, check the paper size, then tap the PDF button."],
];

/** Pre-print review: facts about the PDF, what to double-check, and accurate browser steps.
 *  @returns {Promise<{print: true, simplified: boolean} | null>} */
export async function openPrintDialog({ doc, pages, issues: given }) {
  const design = resolveDesign(doc);
  const tpl = getTemplate(doc.templateId);
  const issues = (given || analyze(doc)).filter((c) => !c.ok);
  const canSimplify = !tpl.atsConscious && !design.simplified;
  const paper = doc.pageSize === "Letter" ? "US Letter" : "A4";

  const simplified = h("input", { type: "checkbox", class: "check__input", id: "print-simplified" });
  const skip = h("input", { type: "checkbox", class: "check__input", id: "print-skip" });

  const body = h(
    "div",
    { class: "print-dialog" },
    h("p", { class: "notice" }, h("span", { text: "Your browser creates the PDF through its Print dialog (Save as PDF). Pagination and margins can differ slightly between browsers, so check the saved file before you send it." })),
    h("dl", { class: "kv" }, h("dt", { text: "Paper" }), h("dd", { text: `${paper}, ${design.margins} mm margins` }), h("dt", { text: "Length" }), h("dd", { text: `About ${pages} page${pages === 1 ? "" : "s"} (estimate)` }), h("dt", { text: "Layout" }), h("dd", { text: `${tpl.name}${design.simplified ? " (simplified)" : ""}${tpl.layout !== "single" && !design.simplified ? ", prints as one column" : ""}` })),
    issues.length
      ? h("div", { class: "notice notice--warn" }, h("div", {}, h("strong", { text: `${issues.length} thing${issues.length === 1 ? "" : "s"} to check before you export:` }), h("ul", { class: "prose-list" }, issues.slice(0, 6).map((c) => h("li", { text: c.detail || c.label })))))
      : h("p", { class: "field__hint", text: "The writing checklist has nothing to flag. Still read the whole preview once." }),
    canSimplify ? h("label", { class: "check", for: "print-simplified" }, simplified, h("span", { text: "Use the simplified single-column layout for this PDF only (plain, ATS-conscious style)" })) : null,
    h("h3", { class: "print-dialog__h", text: "Steps" }),
    h("ol", { class: "steps" }, [
      h("li", {}, h("span", { text: "Choose Open print dialog below." })),
      h("li", {}, h("span", { text: "Set the destination to Save as PDF (not a real printer)." })),
      h("li", {}, h("span", { text: `Paper size ${paper}, scale 100%, headers and footers off.` })),
      h("li", {}, h("span", { text: "Save, then open the PDF: check page breaks, links, and that you can select the text." })),
    ]),
    h("h3", { class: "print-dialog__h", text: "Browser details" }),
    ...BROWSERS.map(([name, text]) => h("details", { class: "print-dialog__browser" }, h("summary", { text: name }), h("p", { text }))),
    h("label", { class: "check", for: "print-skip" }, skip, h("span", { text: "Don't show this review again (you can turn it back on in Settings)" })),
  );

  const result = await openDialog({
    title: "Export as PDF",
    body,
    actions: [
      { label: "Cancel", value: null, variant: "outline" },
      { label: "Open print dialog", value: () => ({ print: true, simplified: simplified.checked }), variant: "primary" },
    ],
  });
  if (result && skip.checked) updateSettings({ printReview: false });
  return result;
}

export const shouldReview = () => getSettings().printReview;
