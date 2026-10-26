// Phase 3 browser checks: gallery, templates, design controls, photo, zoom, simplified layout, print safety.
// Usage: NODE_PATH=<dir with playwright> node e2e/phase3.mjs [baseUrl] [outDir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const out = process.argv[3] || "e2e/screenshots";
mkdirSync(out, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const IDS = ["summit", "grid", "aurora", "velo", "slate", "bloom", "vertex", "nexus"];
// Valid 16x16 red PNG generated at runtime (proper CRCs), so createImageBitmap can decode it
import { deflateSync } from "node:zlib";
function makePng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [200, 40, 40]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PNG = makePng(40, 24);

const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

// Radios are visually hidden under their labels; the busy main thread after heavy renders can swallow a click, so retry.
async function pick(labelText) {
  const input = page.locator(`label:has-text("${labelText}") input`).last();
  for (let i = 0; i < 4; i++) {
    await input.click({ force: true });
    await page.waitForTimeout(120);
    if (await input.isChecked()) return;
  }
  throw new Error(`could not select ${labelText}`);
}
const design = () => page.check('input[name="studio-view"][value="design"]');
const edit = () => page.check('input[name="studio-view"][value="edit"]');

// ---------- gallery ----------
await page.goto(`${base}/#/templates`);
await page.waitForSelector(".template-card .thumb .doc");
check("gallery shows 8 real rendered thumbnails", (await page.locator(".template-card .thumb .doc").count()) === 8);
const rendered = await page.locator(".template-card .thumb .doc").evaluateAll((els) => els.map((e) => e.dataset.template));
check("each gallery card renders its own template", IDS.every((id) => rendered.includes(id)));
await page.click('[data-cat="Tech"]');
check("category filter works (Tech = 2)", (await page.locator(".template-card").count()) === 2);
await page.click('[data-cat="All"]');

await page.getByRole("button", { name: "Preview Velo" }).click();
await page.waitForSelector("dialog .preview-dialog .thumb .doc");
check("preview dialog shows the template and its layout notes", (await page.textContent("dialog")).includes("Two columns"));
await page.screenshot({ path: `${out}/p3-gallery-preview.png` });
await page.getByRole("button", { name: "Use template" }).last().click();
await page.waitForSelector(".studio");
check("Use template with no resume creates one with that template", (await page.locator(".stage__sizer > .doc").getAttribute("data-template")) === "velo");

// ---------- editor: content preserved across all templates ----------
await page.getByLabel("Full name").fill("Casey Preserved");
await page.getByLabel("Professional title").fill("Engineer");
await openExperience(page);
await page.getByRole("button", { name: "Add position" }).click();
await page.getByLabel("Job title").first().fill("Staff Engineer");
await page.getByRole("button", { name: "Add an item" }).click();
await page.getByLabel(/Achievements and responsibilities, item 1/).fill("Kept the content exactly the same");
await page.locator('[data-focus-key="sec:skills"]').click();
await page.getByRole("button", { name: "Add skill group" }).click();
await page.getByLabel("Skills", { exact: true }).fill("Alpha, Beta, Gamma");
await design();
for (const id of IDS) {
  await page.locator(`[data-focus-key="tpl:${id}"]`).click();
  await page.waitForTimeout(120);
  const ok = await page.evaluate(() => {
    const d = document.querySelector(".stage__sizer > .doc");
    return { t: d.dataset.chosen, name: d.querySelector(".doc__name").textContent, text: d.textContent.includes("Kept the content exactly the same") && d.textContent.includes("Staff Engineer") };
  });
  const fit = await page.evaluate(() => { const st = document.querySelector(".stage"); return st.scrollWidth <= st.clientWidth + 1; });
  check(`template ${id}: preview stays fitted after switching`, fit);
  check(`template ${id}: content preserved`, ok.t === id && ok.name === "Casey Preserved" && ok.text);
}

// ---------- long / hostile content never clips ----------
await edit();
await page.getByLabel("Full name").fill("Averyveryverylongunbrokennamewithoutanyspacesatall".repeat(3));
await page.getByLabel("Professional summary, 1", { exact: false }).first().fill("x").catch(() => {});
await page.getByRole("button", { name: "Add another item" }).click();
const bullets = Array.from({ length: 28 }, (_, i) => `Bullet ${i + 1} ` + "wordy ".repeat(30) + "https://example.com/" + "a".repeat(120));
for (let i = 0; i < 6; i++) {
  await page.getByRole("button", { name: /Add another item|Add an item/ }).first().click().catch(() => {});
}
await page.evaluate((list) => {
  const areas = [...document.querySelectorAll(".input--bullet")];
  list.slice(0, areas.length).forEach((t, i) => {
    areas[i].value = t;
    areas[i].dispatchEvent(new Event("input", { bubbles: true }));
  });
}, bullets);
await design();
for (const id of IDS) {
  await page.locator(`[data-focus-key="tpl:${id}"]`).click();
  await page.waitForTimeout(150);
  const clip = await page.evaluate(() => {
    const d = document.querySelector(".stage__sizer > .doc");
    const r = d.getBoundingClientRect();
    const bad = [...d.querySelectorAll("*")].filter((e) => !e.closest(".doc__photo") && e.getBoundingClientRect().right > r.right + 2 && getComputedStyle(e).position !== "absolute").length;
    return { overflow: d.scrollWidth > d.clientWidth + 1, bad };
  });
  check(`template ${id}: long content does not overflow the page`, !clip.overflow && clip.bad === 0, JSON.stringify(clip));
}

// pagination estimate
check("long content reports multiple pages", /About [2-9]\d* pages/.test(await page.textContent(".studio__pageinfo")), await page.textContent(".studio__pageinfo"));
check("page-break guides are drawn", (await page.locator(".stage__guide").count()) >= 1);

// ---------- design controls ----------
await page.getByLabel("Full name").fill("Casey Preserved").catch(() => {});
await edit();
await page.getByLabel("Full name").fill("Casey Preserved");
await design();
await page.locator(`[data-focus-key="tpl:nexus"]`).click();
const titleBefore = await page.locator(".stage__sizer > .doc").evaluate((d) => d.style.getPropertyValue("--title-scale"));
await page.getByLabel("Name size").fill("1.4");
await page.waitForTimeout(150);
check("name size slider changes the live document", (await page.locator(".stage__sizer > .doc").evaluate((d) => d.style.getPropertyValue("--title-scale"))) === "1.4" && titleBefore !== "1.4");
await page.getByLabel("Page margins").fill("28");
await page.getByLabel("Line spacing").fill("1.75");
await page.getByLabel("Section spacing").fill("34");
await page.getByLabel("Text size").fill("1.1");
await page.getByRole("button", { name: /^Accent #d63b25/ }).click();
await page.waitForTimeout(150);
const vars = await page.locator(".stage__sizer > .doc").evaluate((d) => ({ a: d.style.getPropertyValue("--accent"), m: d.style.getPropertyValue("--margin"), lh: d.style.getPropertyValue("--lh"), g: d.style.getPropertyValue("--gap") }));
check("accent, margin, line height and gap apply together", vars.a === "#d63b25" && parseFloat(vars.m) > 100 && vars.lh === "1.75" && vars.g === "34px", JSON.stringify(vars));
await pick("Classic Serif");
await page.waitForTimeout(250);
check("font pairing changes the document font", (await page.locator(".stage__sizer > .doc").evaluate((d) => getComputedStyle(d.querySelector(".doc__name")).fontFamily)).includes("Georgia"));
await pick("Dotted");
await page.waitForTimeout(250);
check("divider style applies", (await page.locator(".stage__sizer > .doc").getAttribute("data-divider")) === "dotted");

// low contrast warning
await page.evaluate(() => {
  const c = document.querySelector(".swatch__custom");
  c.value = "#ffff66";
  c.dispatchEvent(new Event("input", { bubbles: true }));
});
check("low-contrast accent shows a warning", (await page.textContent(".field__hint.is-warn")).includes("Low contrast"));

// persistence
await page.waitForTimeout(900);
await page.reload();
await page.waitForSelector(".stage__sizer > .doc");
check("design settings persist across reload", (await page.locator(".stage__sizer > .doc").getAttribute("data-divider")) === "dotted" && (await page.locator(".stage__sizer > .doc").evaluate((d) => d.style.getPropertyValue("--accent"))) === "#ffff66");

// reset to defaults
await design();
await page.getByRole("button", { name: "Reset to template defaults" }).click();
await page.waitForTimeout(300);
check("reset restores template defaults", (await page.locator(".stage__sizer > .doc").evaluate((d) => d.style.getPropertyValue("--accent"))) === "#3f55e6");

// undo of a template switch
await page.locator(`[data-focus-key="tpl:bloom"]`).click();
await page.getByRole("button", { name: "Undo" }).click();
await page.waitForTimeout(200);
check("undo reverts a template switch", (await page.locator(".stage__sizer > .doc").getAttribute("data-chosen")) === "nexus");

// ---------- simplified layout ----------
await design();
await page.locator(`[data-focus-key="tpl:aurora"]`).click();
await page.waitForTimeout(300);
check("Aurora uses a sidebar", (await page.locator(".stage__sizer .doc__side").count()) === 1);
await page.getByLabel(/Simplified layout/).check();
await page.waitForTimeout(150);
check("simplified layout is single-column Summit structure with no sidebar", (await page.locator(".stage__sizer .doc__side").count()) === 0 && (await page.locator(".stage__sizer > .doc").getAttribute("data-template")) === "summit" && (await page.locator(".stage__sizer > .doc").getAttribute("data-simplified")) === "true");
await page.locator(`[data-focus-key="tpl:grid"]`).click();
await page.waitForTimeout(250);
const simp = page.getByLabel(/Simplified layout/);
check("ATS templates show Simplified as on and locked", (await simp.isChecked()) && (await simp.isDisabled()));
await page.screenshot({ path: `${out}/p3-design-1500.png` });

// ATS structure rules for Summit and Grid
for (const id of ["summit", "grid"]) {
  await page.locator(`[data-focus-key="tpl:${id}"]`).click();
  await page.waitForTimeout(250);
  const s = await page.locator(".stage__sizer > .doc").evaluate((d) => ({ side: d.querySelectorAll(".doc__side").length, img: d.querySelectorAll("img,svg,canvas").length, order: [...d.querySelectorAll("h1,h2")].map((h) => h.tagName), pseudo: [...d.querySelectorAll("*")].some((e) => ["::before", "::after"].some((p) => { const c = getComputedStyle(e, p).content; return c && c !== "none" && c !== "normal" && c !== '""'; })) }));
  check(`${id}: single column, no icons/images by default, real headings, no content in pseudo-elements`, s.side === 0 && s.img === 0 && s.order[0] === "H1" && s.order.slice(1).every((t) => t === "H2") && !s.pseudo, JSON.stringify(s));
}

// ---------- photo ----------
await page.locator(`[data-focus-key="tpl:aurora"]`).click();
await page.getByLabel(/Simplified layout/).uncheck();
await page.locator(`[data-focus-key="tpl:velo"]`).click();
await page.setInputFiles('.design input[type="file"]', { name: "me.png", mimeType: "image/png", buffer: PNG });
await page.waitForSelector(".design .design__photo");
check("photo uploads but is NOT shown until enabled", (await page.locator(".stage__sizer .doc__photo").count()) === 0);
const stored = await page.evaluate(() => document.querySelector(".design .design__photo").src);
check("photo is stored as a small re-encoded JPEG data URL", stored.startsWith("data:image/jpeg;base64,") && stored.length < 150000, `${stored.length} chars`);
await page.locator(".design").getByLabel("Show photo on resume").check();
await page.waitForTimeout(200);
check("photo appears in a layout that supports it once enabled", (await page.locator(".stage__sizer .doc__photo").count()) === 1);
await page.locator(`[data-focus-key="tpl:grid"]`).click();
await page.waitForTimeout(250);
check("Grid never shows the photo and explains why", (await page.locator(".stage__sizer .doc__photo").count()) === 0 && (await page.textContent(".design .photo .notice")).includes("does not show photos"));
await page.locator(`[data-focus-key="tpl:summit"]`).click();
await page.waitForTimeout(250);
check("Summit shows an explicitly enabled photo", (await page.locator(".stage__sizer .doc__photo").count()) === 1);
await edit();
check("photo controls are also in Personal Info", (await page.locator("#sec-contact .photo").count()) === 1);
await design();
await page.locator(`[data-focus-key="tpl:nexus"]`).click();
await page.locator(".design").getByRole("button", { name: "Remove photo" }).click();
await page.waitForTimeout(300);
check("photo can be removed", (await page.locator(".design .design__photo").count()) === 0 && (await page.locator(".stage__sizer .doc__photo").count()) === 0);
await page.setInputFiles('.design input[type="file"]', { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
await page.waitForSelector('.toast:has-text("JPEG, PNG or WebP")');
check("non-image upload is rejected with a clear message", true);

// ---------- zoom ----------
await page.selectOption("#zoom-select", "100");
await page.waitForTimeout(150);
check("100% zoom shows the paper at natural width", Math.abs((await page.locator(".stage__sizer").evaluate((e) => e.getBoundingClientRect().width)) - 794) < 2);
await page.selectOption("#zoom-select", "fit-page");
await page.waitForTimeout(150);
const fp = await page.evaluate(() => { const s = document.querySelector(".stage"); const z = document.querySelector(".stage__sizer"); return z.getBoundingClientRect().width <= s.clientWidth && true; });
check("fit page keeps the paper inside the pane", fp);
await page.selectOption("#zoom-select", "fit-width");

// paper size
await pick("US Letter");
await page.waitForTimeout(200);
check("US Letter changes the paper size", (await page.locator(".stage__sizer > .doc").evaluate((d) => d.style.getPropertyValue("--paper-w"))) === "816px");

// ---------- print safety ----------
// print-media probe on standalone renders so app chrome does not interfere
await page.evaluate(async () => {
  const { renderResume } = await import("/js/preview/render.js");
  const { createSample } = await import("/js/models/resume.js");
  for (const t of ["slate", "aurora", "vertex"]) {
    const el = renderResume(createSample(), { templateId: t });
    el.dataset.probe = t;
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.append(el);
  }
});
await page.emulateMedia({ media: "print" });
const printColors = await page.evaluate(() => [...document.querySelectorAll('.doc[data-probe="slate"],.doc[data-probe="aurora"]')].map((e) => getComputedStyle(e).backgroundColor));
check("dark templates print on white", printColors.length > 0 && printColors.every((c) => c === "rgb(255, 255, 255)"), printColors.join(","));
const headerPrint = await page.evaluate(() => getComputedStyle(document.querySelector('.doc[data-probe="vertex"] .doc__header')).backgroundColor);
check("Vertex header prints without a dark fill", headerPrint === "rgb(255, 255, 255)", headerPrint);
await page.emulateMedia({ media: "screen" });

// ---------- mobile ----------
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card");
await page.getByRole("link", { name: /^Open/ }).first().click();
await page.waitForSelector(".studio");
await design();
await page.waitForTimeout(300);
check("mobile: Design tab shows the design panel", await page.locator(".design").isVisible());
check("mobile: no horizontal overflow in Design", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
await page.screenshot({ path: `${out}/p3-design-390.png` });
await page.check('input[name="studio-view"][value="preview"]');
await page.waitForTimeout(300);
check("mobile: preview fits the screen width", (await page.locator(".stage__sizer").evaluate((e) => e.getBoundingClientRect().width)) <= 390);
await page.screenshot({ path: `${out}/p3-preview-390.png` });
await page.goto(`${base}/#/templates`);
await page.waitForSelector(".template-card .thumb .doc");
check("mobile: gallery has no horizontal overflow", !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
await page.screenshot({ path: `${out}/p3-gallery-390.png`, fullPage: false });
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto(`${base}/#/templates`);
await page.waitForSelector(".template-card .thumb .doc");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/p3-gallery-1500.png`, fullPage: true });

// ---------- use template on an existing resume keeps content ----------
await page.goto(`${base}/#/resume`);
await page.waitForSelector(".studio");
const nameBefore = await page.getByLabel("Full name").inputValue();
await page.goto(`${base}/#/templates`);
await page.getByRole("button", { name: "Use Bloom template" }).click();
await page.waitForSelector(".studio");
check("Use template on an existing resume keeps its content", (await page.getByLabel("Full name").inputValue()) === nameBefore && (await page.locator(".stage__sizer > .doc").getAttribute("data-chosen")) === "bloom");

check("no console errors", errors.length === 0, errors.join(" | "));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);

async function openExperience(p) {
  const toggle = p.locator('[data-focus-key="sec:experience"]');
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}
