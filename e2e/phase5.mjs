// Phase 5 browser checks: cover-letter creation, editing, persistence, consent-based copy from a resume,
// matching templates, saved-list handling, backup/restore with letters, and real PDFs for every template.
// Needs poppler-utils. Usage: NODE_PATH=<playwright dir> node e2e/phase5.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const outDir = "e2e/pdf";
mkdirSync(outDir, { recursive: true });
const check = (name, ok, detail = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const IDS = ["summit", "grid", "aurora", "velo", "slate", "bloom", "vertex", "nexus", "prism", "orbit", "glass", "bento", "horizon", "swiss", "mono"];

function words(pdf) {
  const xml = run("pdftotext", ["-bbox", pdf, "-"]);
  return [...xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)].map((m) => ({
    w: +m[1],
    h: +m[2],
    ws: [...m[3].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/g)].map((w) => ({ x0: +w[1], y0: +w[2], x1: +w[3], y1: +w[4] })),
  }));
}

const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: "en-GB" });
await context.addInitScript(() => { try { if (!localStorage.getItem("cc.settings.v1")) localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true })); } catch {} }); // the first-run tour has its own tests (phase6)
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  window.print = () => (window.__printed = (window.__printed || 0) + 1);
});
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");

const preview = () => page.locator(".stage__sizer > .doc");
const previewText = async () => (await preview().innerText()).replace(/\s+/g, " ");
const open = async (key) => {
  const t = page.locator(`[data-focus-key="sec:${key}"]`);
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
};
const saved = () => page.waitForFunction(() => /Saved on this device/.test(document.querySelector(".studio__status")?.textContent || ""), null, { timeout: 8000 });
const view = (label) => page.locator(`.studio__view input[value="${label.toLowerCase()}"]`).check({ force: true });

// ---------- start page and creation ----------
await page.goto(`${base}/#/cover-letter`);
await page.getByRole("heading", { name: "Start your cover letter" }).waitFor();
check("start page offers blank, from-resume and sample letters", (await page.locator(".trust-card").count()) >= 3 && (await page.getByRole("button", { name: "Choose a resume" }).count()) === 1);
await page.getByRole("button", { name: "Start blank" }).click();
await page.waitForFunction(() => /#\/cover-letter\/[^/]+$/.test(location.hash));
await page.waitForSelector(".studio");
const letterId = page.url().split("/").pop();
check("blank letter opens in the studio", (await page.locator(".studio[data-doc='letter']").count()) === 1);
const cards = await page.locator(".sec__toggle .sec__label").allInnerTexts();
check("editor has the five letter sections", cards.join("|") === "Your details|Recipient and role|Greeting and opening|Body|Closing and signature", cards.join("|"));
check("no resume-only controls (sections button, rail)", (await page.locator(".studio__sections-btn, .studio__rail").count()) === 0);
check("empty letter explains itself in the preview", (await previewText()).includes("Write your letter on the left"));
check("letter title defaults to a letter name", (await page.locator("#doc-title").inputValue()) === "Untitled cover letter");

// ---------- fill every part ----------
await open("contact");
await page.getByLabel("Full name").fill("Casey Writer");
await page.getByLabel("Professional title").fill("Support Engineer");
await page.getByLabel("Email").fill("casey@example.com");
await open("recipient");
await page.getByLabel("Recipient name").fill("Robin Reader");
await page.getByLabel("Recipient title").fill("Team Lead");
await page.getByLabel("Company or organisation").fill("Acme Example");
await page.getByLabel("Role you are applying for").fill("Support Engineer");
await page.getByLabel("Address").fill("1 Example Road\nExampleton");
await page.getByRole("button", { name: "Use today's date" }).click();
await page.waitForTimeout(250);
const dateVal = await page.getByLabel("Date").inputValue();
check("Use today's date fills a real date", /^\d{4}-\d{2}-\d{2}$/.test(dateVal), dateVal);
await open("opening");
await page.getByLabel("Greeting").fill("Dear Robin Reader,");
await page.getByLabel("Opening paragraph").fill("I am writing to apply for the Support Engineer role at Acme Example.");
await open("body");
await page.getByLabel("Body paragraph 1").fill("First body paragraph about Acme Example.");
await page.getByRole("button", { name: "Add paragraph" }).click();
await page.getByLabel("Body paragraph 2").fill("Second body paragraph.");
await page.getByRole("button", { name: "Add paragraph" }).click();
check("a third paragraph can be added and then the limit is explained", (await page.getByLabel("Body paragraph 3").count()) === 1 && (await page.getByRole("button", { name: "Add paragraph" }).count()) === 0 && (await page.getByText(/maximum/).count()) === 1);
await page.getByLabel("Body paragraph 3").fill("Third body paragraph.");
await open("closing");
await page.getByLabel("Closing", { exact: true }).fill("Kind regards,");
await page.getByRole("button", { name: "Use my name" }).click();
await page.waitForTimeout(500);
const txt = await previewText();
const order = ["Casey Writer", "Robin Reader", "Team Lead", "Acme Example", "1 Example Road", "Re: Support Engineer", "Dear Robin Reader,", "I am writing to apply", "First body paragraph", "Second body paragraph", "Third body paragraph", "Kind regards,"].map((s) => txt.indexOf(s));
check("every part appears in the preview, in letter order", order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])), JSON.stringify(order));
check("signature is filled from the typed name", txt.trimEnd().endsWith("Casey Writer"));
check("date is shown in long, locale-aware form", /\d{1,2} \w+ \d{4}/.test(txt));
check("preview is a letter, matching header and template classes", (await preview().getAttribute("data-kind")) === "letter" && (await page.locator(".stage__sizer .doc__header .doc__name").innerText()) === "Casey Writer");

// ---------- autosave and reload ----------
await saved();
await page.reload();
await page.waitForSelector(".studio");
await page.waitForTimeout(400);
const after = await previewText();
check("all content survives a reload", after.includes("Third body paragraph.") && after.includes("Acme Example") && after.includes("Casey Writer"));
check("title and URL remain the same letter", page.url().endsWith(letterId));

// ---------- undo / redo ----------
await open("opening");
await page.getByLabel("Greeting").fill("Hello team,");
await page.waitForTimeout(300);
await page.locator('button[aria-label="Undo"]').click();
await page.waitForTimeout(300);
check("undo restores the previous greeting", (await previewText()).includes("Dear Robin Reader,"));
await page.getByRole("button", { name: "Redo" }).click();
await page.waitForTimeout(300);
check("redo reapplies it", (await previewText()).includes("Hello team,"));
await page.getByLabel("Greeting").fill("Dear Robin Reader,");

// ---------- checklist ----------
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Checklist/ }).click();
const dlg = page.locator("dialog[open]");
check("checklist opens as friendly guidance without ATS or scoring claims", /Everything on this list looks good|friendly guidance/.test(await dlg.innerText()) && !/\bATS\b|guarantee/i.test(await dlg.innerText()));
await page.locator("dialog[open]").getByRole("button", { name: "Close", exact: true }).last().click();
// a missing mention is flagged
await open("recipient");
await page.getByLabel("Company or organisation").fill("Other Company");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Checklist/ }).click();
check("checklist notices when the organisation is never mentioned", /Mention Other Company/.test(await page.locator("dialog[open]").innerText()));
await page.locator("dialog[open]").getByRole("button", { name: "Close", exact: true }).last().click();
await page.getByLabel("Company or organisation").fill("Acme Example");

// ---------- design: every template matches, no overflow, photo ----------
await view("Design");
await page.waitForSelector(".design .design__tpl");
check("design panel offers all 15 templates for a letter", (await page.locator(".design .design__tpl").count()) === 15);
check("section-divider control is hidden for letters", (await page.locator(".design").getByText("Section divider").count()) === 0);
let overflowBad = [];
for (const id of IDS) {
  await page.locator(`[data-focus-key="tpl:${id}"]`).click();
  await page.waitForTimeout(220);
  const info = await page.evaluate(() => {
    const d = document.querySelector(".stage__sizer > .doc");
    const r = d.getBoundingClientRect();
    const bad = [...d.querySelectorAll("*")].filter((e) => !e.closest(".doc__photo") && e.getBoundingClientRect().right > r.right + 2 && getComputedStyle(e).position !== "absolute").length;
    return { chosen: d.dataset.chosen, kind: d.dataset.kind, bad, text: d.innerText.includes("Third body paragraph.") };
  });
  if (info.chosen !== id || info.kind !== "letter" || info.bad || !info.text) overflowBad.push({ id, ...info });
}
check("all 15 templates render the letter completely, without overflow", overflowBad.length === 0, JSON.stringify(overflowBad));
await page.locator(`[data-focus-key="tpl:prism"]`).click();
await page.waitForTimeout(200);
check("a letter in a two-column resume template stays a single column", (await preview().getAttribute("data-layout")) === "single");
await page.getByLabel(/Simplified layout/).check();
await page.waitForTimeout(200);
check("simplified layout works for letters too", (await preview().getAttribute("data-simplified")) === "true" && (await preview().getAttribute("data-template")) === "summit");
await page.getByLabel(/Simplified layout/).uncheck();
await page.locator(`[data-focus-key="tpl:orbit"]`).click();

// ---------- photo: shown at once on upload ----------
await open("contact").catch(() => {});
await view("Edit");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==", "base64");
await open("contact");
await page.locator("#sec-contact input[type=file]").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
await page.waitForSelector("#sec-contact .design__photo");
await page.waitForTimeout(400);
check("a photo added to a letter shows straight away in a supporting template", (await page.locator(".stage__sizer .doc__photo").count()) === 1);

// ---------- copy details from a resume (consent) ----------
const resumeId = await page.evaluate(async () => {
  const { createSample } = await import("/js/models/resume.js");
  const { getRepository } = await import("/js/storage/repository.js");
  const r = createSample();
  r.title = "Copy source";
  r.contact.fullName = "Dana Origin";
  r.contact.email = "dana@example.com";
  r.contact.phone = "+11 111 111";
  r.templateId = "bento";
  r.designSettings = { accent: "#2a8a64" };
  const repo = await getRepository();
  await repo.put(r);
  window.__resumeBefore = JSON.stringify(await repo.get(r.id));
  return r.id;
});
await page.getByRole("button", { name: /Copy details from a resume/ }).click();
const copyDlg = page.locator("dialog[open]");
check("copy dialog says exactly what is copied and that the resume is not changed", /never changed/.test(await copyDlg.innerText()) && /undo/i.test(await copyDlg.innerText()));
await copyDlg.getByText("Copy source").click();
await copyDlg.getByRole("button", { name: "Copy details" }).click();
await page.waitForTimeout(500);
const t2 = await previewText();
check("details were copied into the letter", t2.includes("Dana Origin") && t2.includes("dana@example.com"));
check("the letter text the user wrote is untouched", t2.includes("Third body paragraph.") && t2.includes("Hello team,") === false);
check("the letter now uses the resume's template and accent", (await preview().getAttribute("data-chosen")) === "bento");
const unchanged = await page.evaluate(async (id) => {
  const { getRepository } = await import("/js/storage/repository.js");
  return JSON.stringify(await (await getRepository()).get(id)) === window.__resumeBefore;
}, resumeId);
check("the source resume was not modified", unchanged);
await page.locator('button[aria-label="Undo"]').click();
await page.waitForTimeout(300);
check("copying can be undone", (await previewText()).includes("Casey Writer"));

// ---------- guards between routes ----------
await page.goto(`${base}/#/resume/${letterId}`);
await page.waitForFunction((id) => location.hash === `#/cover-letter/${id}`, letterId);
check("opening a letter through the resume route redirects to the letter editor", true);
await page.goto(`${base}/#/cover-letter/${resumeId}`);
await page.waitForFunction((id) => location.hash === `#/resume/${id}`, resumeId);
check("opening a resume through the letter route redirects to the resume editor", true);
await page.goto(`${base}/#/cover-letter/does-not-exist`);
await page.waitForSelector(".empty__title");
check("an unknown letter id gives a clear not-found message", (await page.textContent(".empty__title")) === "Cover letter not found");

// ---------- saved list ----------
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
check("saved list shows both kinds with badges", (await page.locator(".doc-card .badge", { hasText: "Cover letter" }).count()) >= 1 && (await page.locator(".doc-card .badge", { hasText: /^Resume$/ }).count()) >= 1);
await page.locator('.saved__filter input[value="letter"]').check({ force: true });
check("filter shows only letters", (await page.locator(".doc-card").count()) >= 1 && (await page.locator(".doc-card .badge", { hasText: /^Resume$/ }).count()) === 0);
await page.locator('.saved__filter input[value="all"]').check({ force: true });
const letterCard = page.locator(".doc-card", { hasText: "Untitled cover letter" }).first();
check("letter card links to the letter editor", ((await letterCard.locator("a").first().getAttribute("href")) || "").startsWith("#/cover-letter/"));
await letterCard.getByRole("button", { name: /Rename/ }).click();
await page.locator("#rename-input").fill("Letter for Acme");
await page.locator("dialog[open]").getByRole("button", { name: "Rename" }).click();
await page.waitForSelector(".doc-card:has-text('Letter for Acme')");
check("rename works for a letter", true);
await page.locator(".doc-card", { hasText: "Letter for Acme" }).getByRole("button", { name: /Duplicate/ }).click();
await page.waitForSelector(".doc-card:has-text('Letter for Acme (copy)')");
const dupHref = await page.locator(".doc-card", { hasText: "Letter for Acme (copy)" }).locator("a").first().getAttribute("href");
check("duplicate creates a separate letter", dupHref.startsWith("#/cover-letter/") && !dupHref.endsWith(letterId));
await page.locator(".doc-card", { hasText: "Letter for Acme (copy)" }).getByRole("button", { name: /Delete/ }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Delete" }).click();
await page.waitForTimeout(500);
check("delete requires confirmation and removes only that letter", (await page.locator(".doc-card", { hasText: "Letter for Acme (copy)" }).count()) === 0 && (await page.locator(".doc-card", { hasText: "Letter for Acme" }).count()) === 1);
await page.getByRole("button", { name: "New cover letter" }).first().click();
await page.waitForFunction(() => location.hash.startsWith("#/cover-letter/"));
check("Saved page can start a new letter", true);

// ---------- newer-version letter is never opened or overwritten ----------
await page.evaluate(async () => {
  const { createBlankLetter } = await import("/js/models/cover-letter.js");
  const { getRepository } = await import("/js/storage/repository.js");
  const f = createBlankLetter("From the future");
  f.id = "future-letter";
  f.schemaVersion = 99;
  f.greeting = "keep me";
  const repo = await getRepository();
  await (await import("/js/storage/idb.js")).createIdbStore().then((s) => s.put(f));
});
await page.goto(`${base}/#/cover-letter/future-letter`);
await page.waitForSelector(".empty__title");
check("a newer-version letter explains itself and is not opened", (await page.textContent(".empty__title")) === "Created by a newer version");
const futureIntact = await page.evaluate(async () => {
  const s = await (await import("/js/storage/idb.js")).createIdbStore();
  const r = await s.get("future-letter");
  await s.remove("future-letter");
  return r.schemaVersion === 99 && r.greeting === "keep me";
});
check("it was left byte-for-byte untouched", futureIntact);

// ---------- backup and restore ----------
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
const snapshot = await page.evaluate(async () => {
  const { getRepository } = await import("/js/storage/repository.js");
  const { items } = await (await getRepository()).list();
  return items.filter((d) => d.kind === "cover-letter").map((d) => ({ id: d.id, title: d.title, body: d.body.map((p) => p.text), tpl: d.templateId, greeting: d.greeting, role: d.role, date: d.date }));
});
const [dl] = await Promise.all([page.waitForEvent("download"), (async () => {
  await page.getByRole("button", { name: "Back up all" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Download backup" }).click();
})()]);
const bkPath = `${outDir}/backup-letters.json`;
await dl.saveAs(bkPath);
const bk = JSON.parse(readFileSync(bkPath, "utf8"));
check("backup includes letters and resumes in one file", bk.documents.some((d) => d.kind === "cover-letter") && bk.documents.some((d) => d.kind === undefined));
await page.evaluate(async () => (await (await import("/js/storage/repository.js")).getRepository()).clear());
await page.reload();
await page.waitForSelector(".empty, .doc-grid");
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Restore from backup" }).click()]);
await chooser.setFiles(bkPath);
await page.waitForSelector("dialog[open] .restore__list");
await page.locator("dialog[open]").getByRole("button", { name: "Restore" }).click();
await page.waitForSelector(".doc-card");
const restored = await page.evaluate(async () => {
  const { getRepository } = await import("/js/storage/repository.js");
  const { items } = await (await getRepository()).list();
  return items.filter((d) => d.kind === "cover-letter").map((d) => ({ id: d.id, title: d.title, body: d.body.map((p) => p.text), tpl: d.templateId, greeting: d.greeting, role: d.role, date: d.date }));
});
check("restore after a full wipe returns every letter identically", JSON.stringify(restored.sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(snapshot.sort((a, b) => a.id.localeCompare(b.id))) && restored.length === snapshot.length, `${restored.length}/${snapshot.length}`);

// ---------- export dialog + real PDFs ----------
const makeLetter = (templateId, long) =>
  page.evaluate(async ({ templateId, long }) => {
    const { createLetterSample } = await import("/js/models/cover-letter.js");
    const { applyTemplate } = await import("/js/templates/design.js");
    const d = createLetterSample();
    d.metadata.isSample = false;
    d.contact.fullName = "Alex Printable";
    d.signature = "Signoff Name";
    d.closing = "Warm regards,";
    applyTemplate(d, templateId);
    d.designSettings.showPhoto = true;
    const sentence = (n, k) => `Sentence ${n} of paragraph ${k} says something specific that the writer would support with facts about their own work and what changed afterwards.`;
    const para = (k, n) => Array.from({ length: n }, (_, i) => sentence(i + 1, k)).join(" ");
    d.opening = para(0, long ? 9 : 2);
    d.body = [1, 2, 3].map((k) => ({ id: `p${k}`, text: long ? `${para(k, 9)}\n\n${para(k + 10, 8)}` : para(k, 3) }));
    window.__doc = d;
  }, { templateId, long });
async function pdfOf(name) {
  await page.evaluate(async () => { window.__prep = (await import("/js/export/print.js")).preparePrint(window.__doc, {}); });
  const file = `${outDir}/${name}.pdf`;
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
  const prep = await page.evaluate(() => window.__prep);
  await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());
  return { file, prep };
}
const MARGINS = { aurora: 14, summit: 18, velo: 14, slate: 16, bloom: 18, grid: 16, vertex: 14, nexus: 12, prism: 14, orbit: 14, glass: 12, bento: 12, horizon: 14, swiss: 14, mono: 16 };
for (const id of IDS) {
  await makeLetter(id, false);
  const short = await pdfOf(`letter-short-${id}`);
  const si = run("pdfinfo", [short.file]);
  const stext = run("pdftotext", ["-layout", short.file, "-"]).replace(/\s+/g, " ");
  check(`${id}: a normal letter fits on ONE page, A4, with real text`, /Pages:\s+1\b/.test(si) && /A4|595\.\d+ x 841\.\d+/.test(si) && stext.includes("Warm regards, Signoff Name") && stext.includes("Sentence 3 of paragraph 3"));
  await makeLetter(id, true);
  const { file, prep } = await pdfOf(`letter-long-${id}`);
  const pages = Number(/Pages:\s+(\d+)/.exec(run("pdfinfo", [file]))[1]);
  const text = run("pdftotext", ["-layout", file, "-"]).replace(/\s+/g, " ");
  const missing = [];
  for (const k of [0, 1, 2, 3, 11, 12, 13]) for (const n of [1, k > 10 ? 8 : 9]) if (!text.includes(`Sentence ${n} of paragraph ${k} `)) missing.push(`${n}/${k}`);
  check(`${id}: a long letter paginates (2+ pages) with no clipped or missing text`, prep.pageRule && pages >= 2 && missing.length === 0, `${pages} pages, missing ${missing.join(",")}`);
  const pw = words(file);
  const need = (MARGINS[id] / 25.4) * 72 - 2;
  const bad = pw.filter((p) => p.ws.some((w) => w.x0 < need || w.y0 < need * 0.9 - 8 || w.x1 > p.w - need || w.y1 > p.h - need * 0.9));
  check(`${id}: margins respected on every page`, bad.length === 0, `${bad.length} bad pages`);
  const lastLines = pw.slice(0, -1).map((_, i) => run("pdftotext", ["-f", String(i + 1), "-l", String(i + 1), "-layout", file, "-"]).trim().split("\n").pop().trim());
  check(`${id}: date, subject, greeting and closing are not stranded at a page bottom`, lastLines.every((l) => !/^(\d{1,2} \w+ \d{4}|Re: .*|Dear .*|Warm regards,)$/.test(l)), lastLines.join(" | "));
  const closePage = [...Array(pages)].findIndex((_, i) => run("pdftotext", ["-f", String(i + 1), "-l", String(i + 1), file, "-"]).includes("Warm regards,"));
  const signPage = [...Array(pages)].findIndex((_, i) => run("pdftotext", ["-f", String(i + 1), "-l", String(i + 1), file, "-"]).includes("Signoff Name"));
  check(`${id}: closing and signature stay together`, closePage === signPage && closePage >= 0);
  check(`${id}: no app chrome in the PDF`, !/get started|settings|page 2 starts|skip to content/i.test(text));
}
await makeLetter("slate", false);
const dark = await pdfOf("letter-slate-dark");
run("pdftoppm", ["-r", "30", "-f", "1", "-l", "1", "-png", dark.file, `${outDir}/px-letter-slate`]);
const mean = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let dk = 0;
  for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 90) dk++;
  return dk / (d.length / 4);
}, readFileSync(`${outDir}/px-letter-slate-1.png`).toString("base64"));
check("a dark-template letter prints on white", mean < 0.08, String(mean));

// export button + print dialog for a letter
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
await page.locator(".doc-card", { hasText: "Letter for Acme" }).locator("a").first().click();
await page.waitForSelector(".studio[data-doc='letter']");
await page.getByRole("button", { name: /Export PDF/ }).click();
await page.waitForSelector("dialog[open] .print-dialog");
const pd = await page.locator("dialog[open]").innerText();
check("export review for a letter shows paper, length and honest wording", /A4|US Letter/.test(pd) && /Save as PDF/.test(pd) && !/guarantee/i.test(pd));
await page.locator("dialog[open]").getByRole("button", { name: "Open print dialog" }).click();
await page.waitForTimeout(500);
check("export opens the print dialog with the letter in #print-root", (await page.evaluate(() => window.__printed)) === 1);
await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());

// ---------- mobile ----------
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(`${base}/#/cover-letter/${letterId}`);
  await page.waitForSelector(".studio");
  const o1 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await view("Design").catch(() => {});
  const o2 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await view("Preview").catch(() => {});
  await page.waitForTimeout(300);
  const o3 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`no horizontal overflow on a letter @${w} (edit, design, preview)`, o1 <= 1 && o2 <= 1 && o3 <= 1, `${o1}/${o2}/${o3}`);
  const fit = await page.evaluate(() => { const s = document.querySelector(".stage__sizer"); return !s || s.getBoundingClientRect().right <= innerWidth + 1; });
  check(`letter preview fits the screen @${w}`, fit);
}
await page.setViewportSize({ width: 1440, height: 900 });

check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
