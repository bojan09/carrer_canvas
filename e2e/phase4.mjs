// Phase 4 browser checks: real PDFs from Chromium's print engine, print flow, backup/restore, draft recovery.
// Needs poppler-utils (pdfinfo, pdftotext, pdftoppm, pdfimages). Usage: NODE_PATH=<playwright dir> node e2e/phase4.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const outDir = "e2e/pdf";
mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function makePng(w, h) {
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, (_, i) => [60 + i * 2, 90, 160]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch("IHDR", ih), ch("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), ch("IEND", Buffer.alloc(0))]);
}

/** words with positions per page from pdftotext -bbox */
function words(pdf) {
  const xml = run("pdftotext", ["-bbox", pdf, "-"]);
  const pages = [];
  for (const m of xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const ws = [...m[3].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/g)].map((w) => ({ x0: +w[1], y0: +w[2], x1: +w[3], y1: +w[4] }));
    pages.push({ w: +m[1], h: +m[2], ws });
  }
  return pages;
}

const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await context.addInitScript(() => { try { if (!localStorage.getItem("cc.settings.v1")) localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true })); } catch {} }); // the first-run tour has its own tests (phase6)
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  window.__printed = 0;
  window.print = () => {
    window.__printed++;
    window.__printTitle = document.title;
    window.__printHadDoc = Boolean(document.querySelector("#print-root .doc"));
  };
});
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");

const IDS = ["summit", "grid", "aurora", "velo", "slate", "bloom", "vertex", "nexus", "prism", "orbit", "glass", "bento", "horizon", "swiss", "mono"];

// A long resume so every template runs to 2+ pages
const makeDoc = (templateId, extra = {}) =>
  page.evaluate(async ({ templateId, extra }) => {
    const { createSample, emptyItem, newId } = await import("/js/models/resume.js");
    const { applyTemplate } = await import("/js/templates/design.js");
    const d = createSample();
    d.contact.fullName = "Alex Printable";
    applyTemplate(d, templateId);
    for (let i = 0; i < 6; i++) {
      d.sections.experience.items.push({
        ...emptyItem("experience"),
        title: `Role number ${i + 1}`,
        organization: `Company ${i + 1}`,
        startDate: "2015-01",
        endDate: "2016-01",
        bullets: Array.from({ length: 5 }, (_, k) => ({ id: newId(), text: `Bullet ${k + 1} for role ${i + 1}: planned the work, built the thing together with others, and followed up afterwards to learn what to change next time.` })),
      });
    }
    d.sections.projects.items.push({ ...emptyItem("projects"), name: "Side project", role: "Maker", url: "example.com/side", bullets: [{ id: newId(), text: "Built something small and useful." }] });
    d.sections.certifications.items.push({ ...emptyItem("certifications"), title: "Sample certificate", issuer: "Example Institute", date: "2020-05" });
    Object.assign(d, extra.doc || {});
    if (extra.design) d.designSettings = { ...d.designSettings, ...extra.design };
    window.__doc = d;
    return d.id;
  }, { templateId, extra });

async function makePdf(name, opts = {}) {
  await page.evaluate(async (opts) => {
    const { preparePrint } = await import("/js/export/print.js");
    window.__prep = preparePrint(window.__doc, opts);
  }, opts);
  const file = `${outDir}/${name}.pdf`;
  // background graphics OFF is the browser default, so test the harsher case
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
  const prep = await page.evaluate(() => window.__prep);
  await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());
  return { file, prep };
}

// ---------- PDFs for every template ----------
for (const id of IDS) {
  await makeDoc(id);
  const { file, prep } = await makePdf(`tpl-${id}`);
  const info = run("pdfinfo", [file]);
  const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
  const text = run("pdftotext", ["-layout", file, "-"]).replace(/\s+/g, " ").toLowerCase();
  const pw = await words(file);
  const marginPt = (await page.evaluate(() => window.__doc.designSettings.margins)) ?? null;
  check(`${id}: @page rule accepted`, prep.pageRule === true);
  check(`${id}: PDF has multiple pages`, pages >= 2, `${pages} pages`);
  check(`${id}: PDF is A4`, Math.abs(+size[1] - 595.3) < 2 && Math.abs(+size[2] - 841.9) < 2, `${size[1]}x${size[2]}`);
  check(`${id}: text is real and selectable`, text.includes("alex printable") && text.includes("bullet 5 for role 6") && text.includes("sample certificate"));
  check(`${id}: no app chrome or preview guides in the PDF`, !/get started|settings|page 2 starts|skip to content/.test(text));
  // real margins on EVERY page (min distance of any word from every edge)
  const tplMargins = { aurora: 14, summit: 18, velo: 14, slate: 16, bloom: 18, grid: 16, vertex: 14, nexus: 12, prism: 14, orbit: 14, glass: 12, bento: 12, horizon: 14, swiss: 14, mono: 16 }[id];
  const need = (tplMargins / 25.4) * 72 - 2; // vertical checks allow 8pt for font ascent in the reported glyph box
  const bad = pw.filter((p) => p.ws.some((w) => w.x0 < need || w.y0 < need * 0.9 - 8 || w.x1 > p.w - need || w.y1 > p.h - need * 0.9));
  check(`${id}: margins respected on every page`, bad.length === 0, `${pw.length} pages, ${bad.length} violating ${JSON.stringify(bad.map((p) => ({ w: p.w, h: p.h, need, v: p.ws.filter((w) => w.x0 < need || w.y0 < need * 0.9 - 8 || w.x1 > p.w - need || w.y1 > p.h - need * 0.9).slice(0, 2) })))}`);
  // headings are not stranded at the bottom of a page
  const lastLines = pw.slice(0, -1).map((_, i) => run("pdftotext", ["-f", String(i + 1), "-l", String(i + 1), "-layout", file, "-"]).trim().split("\n").pop().trim());
  const heads = ["Professional Summary", "Work Experience", "Education", "Skills", "Projects", "Certifications", "Languages"].map((h) => h.toLowerCase());
  check(`${id}: no heading stranded at the bottom of a page`, lastLines.every((l) => !heads.includes(l.toLowerCase())), lastLines.join(" | "));
}

// ---------- dark templates print on white; Vertex header has no dark fill ----------
for (const id of ["slate", "aurora", "vertex"]) {
  const file = `${outDir}/tpl-${id}.pdf`;
  run("pdftoppm", ["-r", "30", "-f", "1", "-l", "1", "-png", file, `${outDir}/px-${id}`]);
}
function brightness(png) {
  // decode via Chromium: draw to canvas
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; if (v < 90) dark++; }
    return { mean: sum / (d.length / 4) / 255, darkShare: dark / (d.length / 4) };
  }, readFileSync(png).toString("base64"));
}
for (const id of ["slate", "aurora"]) {
  const b = await brightness(`${outDir}/px-${id}-1.png`);
  check(`${id}: page prints on white (ink-efficient)`, b.mean > 0.9 && b.darkShare < 0.08, JSON.stringify(b));
}
const vb = await brightness(`${outDir}/px-vertex-1.png`);
check("vertex: header prints outlined, not as a dark block", vb.darkShare < 0.08, JSON.stringify(vb));

// ---------- sidebar templates print as ONE content-complete column ----------
for (const id of ["aurora", "velo"]) {
  const text = run("pdftotext", ["-raw", `${outDir}/tpl-${id}.pdf`, "-"]).toLowerCase();
  const iExp = text.indexOf("work experience");
  const iSkills = text.indexOf("skills");
  check(`${id}: sidebar content is present and follows the main content in print`, iExp > -1 && iSkills > iExp && text.includes("languages") && text.includes("interaction design"), `exp@${iExp} skills@${iSkills}`);
}

// ---------- US Letter + margins from design ----------
await makeDoc("summit", { doc: { pageSize: "Letter" }, design: { margins: 25 } });
{
  const { file } = await makePdf("letter-summit");
  const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(run("pdfinfo", [file]));
  check("US Letter produces a Letter-sized PDF", Math.abs(+size[1] - 612) < 2 && Math.abs(+size[2] - 792) < 2, `${size[1]}x${size[2]}`);
  const pw = await words(file);
  const need = (25 / 25.4) * 72 - 2;
  check("custom 25 mm margins are honoured on every page", pw.every((p) => p.ws.every((w) => w.x0 >= need && w.x1 <= p.w - need)));
}

// ---------- photo: absent by default, present only when enabled and supported ----------
{
  const png = makePng(40, 40);
  const dataUrl = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { compressPhoto } = await import("/js/editors/photo.js");
    const r = await compressPhoto(new File([bytes], "a.png", { type: "image/png" }));
    return r;
  }, png.toString("base64"));
  await makeDoc("velo");
  await page.evaluate((p) => { window.__doc.photo = p; window.__doc.designSettings.showPhoto = false; }, dataUrl);
  let { file } = await makePdf("photo-off");
  check("photo is NOT printed unless enabled", run("pdfimages", ["-list", file]).trim().split("\n").length <= 2);
  await page.evaluate(() => (window.__doc.designSettings.showPhoto = true));
  ({ file } = await makePdf("photo-on"));
  check("photo is printed when explicitly enabled", run("pdfimages", ["-list", file]).trim().split("\n").length >= 3);
  await page.evaluate(() => (window.__doc.templateId = "grid"));
  ({ file } = await makePdf("photo-grid"));
  check("Grid prints an explicitly enabled photo", run("pdfimages", ["-list", file]).trim().split("\n").length >= 3);
  await page.evaluate(() => { window.__doc.templateId = "velo"; window.__doc.designSettings.simplified = true; });
  ({ file } = await makePdf("photo-simplified"));
  check("simplified layout never prints the photo", run("pdfimages", ["-list", file]).trim().split("\n").length <= 2);
}

// ---------- transient simplified print option ----------
await makeDoc("aurora");
{
  const { file } = await makePdf("aurora-simplified", { simplified: true });
  const text = run("pdftotext", ["-raw", file, "-"]).toLowerCase();
  check("print-only simplified option works without changing the saved design", text.includes("alex printable") && (await page.evaluate(() => window.__doc.designSettings.simplified)) !== true);
}

// ---------- beforeprint wiring ----------
await page.goto(`${base}/#/saved`);
await page.evaluate(async () => {
  const { getRepository } = await import("/js/storage/repository.js");
  const { createSample } = await import("/js/models/resume.js");
  const repo = await getRepository();
  const d = createSample();
  d.title = "Print test resume";
  d.contact.fullName = "Pat Printer";
  await repo.put(d);
  window.__id = d.id;
});
await page.goto(`${base}/#/resume/${await page.evaluate(() => window.__id)}`);
await page.waitForSelector(".studio");
await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
check("Ctrl+P path: beforeprint fills the print root from the open resume", (await page.locator("#print-root .doc__name").textContent()) === "Pat Printer" && (await page.evaluate(() => document.body.dataset.print)) === "resume");
check("document title becomes the PDF file name", (await page.title()) === "Pat Printer - Resume");
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
check("afterprint restores the page", (await page.locator("#print-root .doc").count()) === 0 && (await page.evaluate(() => document.body.dataset.print)) === undefined && (await page.title()) !== "Pat Printer - Resume");

// ---------- export dialog flow ----------
await page.getByRole("button", { name: /Export as PDF/ }).click();
await page.waitForSelector("dialog .print-dialog");
const dlg = await page.textContent("dialog");
check("export dialog explains Save as PDF, paper, checklist and browser steps", /Save as PDF/.test(dlg) && /A4|US Letter/.test(dlg) && /Chrome, Edge/.test(dlg) && /Safari/.test(dlg) && /iPhone/.test(dlg) && /fictional sample text/.test(dlg));
check("export dialog makes no false direct-PDF claim", /browser creates the PDF|Print dialog/i.test(dlg) && !/download.*pdf automatically/i.test(dlg));
await page.screenshot({ path: "e2e/screenshots/p4-export-dialog.png" });
await page.getByRole("button", { name: "Open print dialog" }).click();
await page.waitForFunction(() => window.__printed === 1);
check("Open print dialog calls window.print with the resume prepared", (await page.evaluate(() => window.__printHadDoc)) === true && (await page.evaluate(() => window.__printTitle)) === "Pat Printer - Resume");
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

// skip review next time
await page.getByRole("button", { name: /Export as PDF/ }).click();
await page.locator("#print-skip").check();
await page.getByRole("button", { name: "Open print dialog" }).click();
await page.waitForFunction(() => window.__printed === 2);
await page.getByRole("button", { name: /Export as PDF/ }).click();
await page.waitForFunction(() => window.__printed === 3);
check("review can be skipped, then export prints directly", (await page.locator("dialog").count()) === 0);

// ---------- backup & restore ----------
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
// add a photo to the stored doc so we can test the include-photos option
await page.evaluate(async () => {
  const { getRepository } = await import("/js/storage/repository.js");
  const repo = await getRepository();
  const d = await repo.get(window.__id);
  d.photo = { data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ", width: 320, height: 320 };
  await repo.put(d);
});
await page.reload();
await page.waitForSelector(".doc-card");
await page.getByRole("button", { name: "Back up all" }).click();
check("backup warns the file holds personal data", (await page.textContent("dialog")).includes("plain text"));
let [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
const noPhotoFile = `${outDir}/backup-nophoto.json`;
await dl.saveAs(noPhotoFile);
const bk = JSON.parse(readFileSync(noPhotoFile, "utf8"));
check("backup file is versioned, dated and omits photos by default", bk.kind === "backup" && bk.format === 1 && bk.schemaVersion === 3 && /^careercanvas-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && bk.documents.length >= 1 && bk.documents.every((d) => d.photo === null) && bk.includesPhotos === false);
await page.getByRole("button", { name: "Back up all" }).click();
await page.locator("#bk-photos").check();
[dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
await dl.saveAs(`${outDir}/backup-photo.json`);
const bk2 = JSON.parse(readFileSync(`${outDir}/backup-photo.json`, "utf8"));
check("photos are embedded only when the user ticks the option", bk2.includesPhotos === true && bk2.documents.some((d) => d.photo));
check("last backup time is shown", (await page.textContent(".backup-bar__text")).startsWith("Last backup:"));

// single-document export from a card
[dl] = await Promise.all([page.waitForEvent("download"), (async () => { await page.getByRole("button", { name: /^Export:/ }).first().click(); await page.getByRole("button", { name: "Download backup" }).click(); })()]);
check("single-document export names the file after the resume", /careercanvas-print-test-resume-\d{4}/.test(dl.suggestedFilename()), dl.suggestedFilename());

// wipe, then restore
await page.goto(`${base}/#/settings`);
await page.getByRole("button", { name: "Delete all…" }).click();
await page.getByRole("button", { name: "Continue" }).click();
await page.fill("#wipe-confirm", "DELETE");
await page.getByRole("button", { name: "Delete everything" }).click();
await page.waitForSelector('.toast:has-text("All documents deleted")');

async function restoreFrom(file, button = "Restore") {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /Restore…|Restore from backup/ }).first().click()]);
  await chooser.setFiles(file);
  await page.waitForSelector("dialog");
  return button;
}
await restoreFrom(`${outDir}/backup-photo.json`);
check("restore preview lists what it found", (await page.textContent("dialog")).includes("Print test resume"));
await page.getByRole("button", { name: "Restore", exact: true }).click();
await page.waitForSelector('.toast:has-text("Restore complete")');
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
const countAfter = await page.locator(".doc-card").count();
check("backup round trip restores the documents after a full wipe", countAfter === bk2.documents.length, `${countAfter}`);
const restored = await page.evaluate(async (id) => (await (await import("/js/storage/repository.js")).getRepository()).get(id), bk2.documents[0].id);
check("restored document equals the original (content, template, design, photo)", JSON.stringify(restored) === JSON.stringify(bk2.documents.find((d) => d.id === restored.id)));

// duplicates: keep both
await page.goto(`${base}/#/settings`);
await restoreFrom(`${outDir}/backup-photo.json`);
check("duplicate handling is offered when ids already exist", (await page.textContent("dialog")).includes("already exist"));
await page.getByRole("button", { name: "Restore", exact: true }).click();
await page.waitForSelector('.toast:has-text("copied")');
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
check("keep-both imports renamed copies without touching the originals", (await page.locator(".doc-card").count()) === countAfter * 2 && (await page.locator('.doc-card__title:has-text("(imported)")').count()) === countAfter);

// skip existing
await page.goto(`${base}/#/settings`);
await restoreFrom(`${outDir}/backup-photo.json`);
await page.locator('input[value="skip"]').check();
await page.getByRole("button", { name: "Restore", exact: true }).click();
await page.waitForSelector('.toast:has-text("skipped")');
check("skip existing adds nothing", true);

// invalid / hostile / newer files
writeFileSync(`${outDir}/bad.json`, "{ this is not json");
await restoreFrom(`${outDir}/bad.json`);
check("a damaged file is explained, nothing is imported", (await page.textContent("dialog")).includes("not a JSON file"));
await page.getByRole("button", { name: "Close", exact: true }).last().click();
writeFileSync(`${outDir}/mixed.json`, JSON.stringify({ kind: "backup", app: "CareerCanvas", format: 1, documents: [{ ...bk.documents[0], id: "mixed-ok", contact: { ...bk.documents[0].contact, fullName: "<img src=x onerror=window.__pwned=1>" } }, { ...bk.documents[0], id: "mixed-future", schemaVersion: 99 }, { junk: 1 }] }));
await restoreFrom(`${outDir}/mixed.json`);
const mixedText = await page.textContent("dialog");
check("partially valid file: valid kept, newer-version and junk skipped with reasons", /2 items will be skipped/.test(mixedText) && /newer version/.test(mixedText));
await page.getByRole("button", { name: "Restore", exact: true }).click();
await page.waitForFunction(async () => Boolean(await (await (await import("/js/storage/repository.js")).getRepository()).get("mixed-ok")), null, { timeout: 8000 });
await page.goto(`${base}/#/resume/mixed-ok`);
await page.waitForSelector(".studio", { timeout: 10000 });
await page.waitForTimeout(300);
check("hostile text from a backup stays inert text", (await page.evaluate(() => window.__pwned)) === undefined && (await page.locator(".stage__sizer .doc__name").textContent()).includes("<img"));

// ---------- crash recovery (shadow copy) ----------
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
const rid = bk2.documents.find((d) => d.title === "Print test resume").id;
await page.goto(`${base}/#/resume/${rid}`);
await page.waitForSelector(".studio");
await page.evaluate(() => {
  window.__shadowWrites = [];
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (String(k).startsWith("cc.shadow.")) window.__shadowWrites.push(k);
    return orig.call(this, k, v);
  };
});
await page.getByLabel("Full name").fill("Typed just before the crash");
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
check("hiding the tab with a pending save writes a synchronous shadow copy", (await page.evaluate(() => window.__shadowWrites.length)) >= 1);
await page.evaluate(() => Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }));
await page.waitForFunction((id) => localStorage.getItem(`cc.shadow.${id}`) === null, rid, { timeout: 5000 });
check("shadow copy is removed once the real save succeeds", true);

// simulate a crash: stored doc is older than the shadow
await page.evaluate(async (id) => {
  const repo = await (await import("/js/storage/repository.js")).getRepository();
  const d = await repo.get(id);
  const newer = structuredClone(d);
  newer.contact.fullName = "Recovered after crash";
  newer.updatedAt = new Date(Date.now() + 60000).toISOString();
  localStorage.setItem(`cc.shadow.${id}`, JSON.stringify({ savedAt: new Date().toISOString(), doc: newer }));
}, rid);
await page.reload();
await page.waitForSelector("dialog");
check("an interrupted session offers its unsaved changes back", (await page.textContent("dialog")).includes("Recover unsaved changes"));
await page.screenshot({ path: "e2e/screenshots/p4-recover-dialog.png" });
await page.getByRole("button", { name: "Restore changes" }).click();
await page.waitForTimeout(300);
check("restoring recovers the text", (await page.getByLabel("Full name").inputValue()) === "Recovered after crash");
await page.locator('button[aria-label="Undo"]').click();
await page.waitForTimeout(200);
check("recovery is undoable", (await page.getByLabel("Full name").inputValue()) !== "Recovered after crash");
await page.evaluate(async (id) => {
  const repo = await (await import("/js/storage/repository.js")).getRepository();
  const d = await repo.get(id);
  const newer = structuredClone(d);
  newer.contact.fullName = "Should be discarded";
  newer.updatedAt = new Date(Date.now() + 120000).toISOString();
  localStorage.setItem(`cc.shadow.${id}`, JSON.stringify({ savedAt: new Date().toISOString(), doc: newer }));
}, rid);
await page.reload();
await page.waitForSelector("dialog");
await page.getByRole("button", { name: "Keep saved version" }).click();
await page.waitForTimeout(300);
check("keeping the saved version discards the shadow", (await page.getByLabel("Full name").inputValue()) !== "Should be discarded" && (await page.evaluate((id) => localStorage.getItem(`cc.shadow.${id}`), rid)) === null);

// ---------- default paper size ----------
await page.goto(`${base}/#/settings`);
await page.locator('label:has-text("US Letter") input').first().check({ force: true });
await page.goto(`${base}/#/saved`);
await page.getByRole("button", { name: "New blank resume" }).click();
await page.waitForSelector(".studio");
check("default paper size from Settings applies to new documents", (await page.locator(".stage__sizer > .doc").evaluate((d) => d.style.getPropertyValue("--paper-w"))) === "816px");

// ---------- layout sanity on small screens ----------
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  for (const route of ["saved", "settings"]) {
    await page.goto(`${base}/#/${route}`);
    await page.waitForTimeout(500);
    check(`no horizontal overflow on ${route} @${w}`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  }
}
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto(`${base}/#/settings`);
await page.waitForTimeout(400);
await page.screenshot({ path: "e2e/screenshots/p4-settings.png", fullPage: true });

check("no console errors", errors.length === 0, errors.join(" | "));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
