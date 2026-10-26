import { renderDocument } from "../preview/render.js";
import { isLetter } from "../models/cover-letter.js";
import { FONT_FAMILIES, resolveDesign } from "../templates/design.js";
import { cleanText } from "../utils/sanitization.js";

/** Print-to-PDF support.
 *  The browser's print engine makes the PDF. We (1) draw the canonical resume into #print-root,
 *  (2) set @page size/margins through CSSOM (CSP-safe), (3) hide every other surface via print.css,
 *  and (4) name the document so "Save as PDF" suggests a sensible filename. */

export const pdfFileName = (doc) => {
  const base = cleanText(doc.contact.fullName || doc.title || "Resume", 80)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return isLetter(doc) ? `${base || "Cover letter"} - Cover Letter` : `${base || "Resume"} - Resume`;
};

export const pageRuleText = (doc) => `@page { size: ${doc.pageSize === "Letter" ? "letter" : "A4"}; margin: ${resolveDesign(doc).margins}mm; }`;

/** Writes the @page rule into the print-only stylesheet. Returns false when the browser refuses
 *  (the static default in css/print-page.css then applies). */
export function applyPageRule(doc) {
  const sheet = document.getElementById("print-page-sheet")?.sheet;
  if (!sheet) return false;
  try {
    while (sheet.cssRules.length) sheet.deleteRule(0);
    sheet.insertRule(pageRuleText(doc), 0);
    return true;
  } catch {
    return false;
  }
}

let savedTitle = null;
let preparedAt = 0;

/** @returns {{pageRule: boolean}} */
export function preparePrint(doc, { simplified = false } = {}) {
  const root = document.getElementById("print-root");
  const source = simplified ? { ...doc, designSettings: { ...doc.designSettings, simplified: true } } : doc;
  root.replaceChildren(renderDocument(source, { forPrint: true }));
  document.body.dataset.print = "resume";
  preparedAt = Date.now();
  if (savedTitle === null) savedTitle = document.title;
  document.title = pdfFileName(doc);
  return { pageRule: applyPageRule(doc) };
}

export function cleanupPrint() {
  const root = document.getElementById("print-root");
  root?.replaceChildren();
  delete document.body.dataset.print;
  preparedAt = 0;
  if (savedTitle !== null) {
    document.title = savedTitle;
    savedTitle = null;
  }
}

/** Bundled fonts load on first use, so make sure every font the document uses is ready before paper is made.
 *  Otherwise the PDF would silently fall back to a system font. */
export async function loadDocFonts(doc) {
  if (!document.fonts?.load) return;
  const jobs = [];
  for (const el of Object.values(resolveDesign(doc).elements)) {
    const stack = el.font ? FONT_FAMILIES[el.font].stack : "";
    const family = /^"([^"]+ Variable)"/.exec(stack)?.[1];
    if (family) jobs.push(document.fonts.load(`${el.weight || 400} 16px "${family}"`).catch(() => {}));
  }
  await Promise.all(jobs);
}

/** Opens the browser print dialog for this document. Resolves after the dialog call returns. */
export async function printResume(doc, opts = {}) {
  await loadDocFonts(doc);
  const result = preparePrint(doc, opts);
  const imgs = [...document.querySelectorAll("#print-root img")];
  await Promise.all(imgs.map((img) => img.decode?.().catch(() => {})));
  window.print();
  return result;
}

/** Makes Ctrl/Cmd+P (and the menu Print command) print the open resume instead of the app UI. */
export function initPrintSupport(getDoc) {
  const before = () => {
    // printResume() already prepared this print (possibly with a print-only option): keep it.
    // The age limit stops a stale preparation from printing old content if afterprint never fired.
    if (document.body.dataset.print === "resume" && Date.now() - preparedAt < 60_000) return;
    const doc = getDoc();
    if (doc) preparePrint(doc);
  };
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", cleanupPrint);
  // Safari fallback: it reports print mode through matchMedia
  const mq = window.matchMedia("print");
  mq.addEventListener?.("change", (e) => (e.matches ? before() : cleanupPrint()));
}
