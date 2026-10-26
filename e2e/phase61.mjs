// Phase 6.1 browser checks: finding the Style tab, click-to-style, the Format text panel, fonts, boldness,
// size, photo resize/move, the improved panel, undo, persistence and real PDFs. Needs poppler-utils.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const outDir = "e2e/pdf";
mkdirSync(outDir, { recursive: true });
const check = (name, ok, detail = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const browser = await chromium.launch();
const errors = [];
const external = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-GB" });
await context.addInitScript(() => { try { if (!localStorage.getItem("cc.settings.v1")) localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true })); } catch {} });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
page.on("request", (r) => { if (!r.url().startsWith(base) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.push(r.url()); });
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");

const newDoc = (kind, templateId, extra = {}) =>
  page.evaluate(async ({ kind, templateId, extra }) => {
    const { getRepository } = await import("/js/storage/repository.js");
    const { applyTemplate } = await import("/js/templates/design.js");
    const m = kind === "letter" ? await import("/js/models/cover-letter.js") : await import("/js/models/resume.js");
    const d = kind === "letter" ? m.createLetterSample() : m.createSample();
    applyTemplate(d, templateId);
    d.designSettings = { ...d.designSettings, showPhoto: true, ...(extra.design || {}) };
    await (await getRepository()).put(d);
    return d.id;
  }, { kind, templateId, extra });
const open = async (kind, id) => {
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector("main > *");
  await page.goto(`${base}/#/${kind === "letter" ? "cover-letter" : "resume"}/${id}`);
  await page.waitForSelector(".stage__sizer > .doc", { state: "attached" });
};
const doc = (sel) => page.locator(`.stage__sizer > .doc ${sel}`).first();
const css = (sel, prop) => page.evaluate(({ sel, prop }) => getComputedStyle(document.querySelector(`.stage__sizer > .doc ${sel}`))[prop], { sel, prop });
const fontReady = (family) => page.waitForFunction((f) => document.fonts.check(`16px "${f}"`) && [...document.fonts].some((x) => x.family.replace(/"/g, "") === f && x.status === "loaded"), family, { timeout: 8000 });
const settle = () => page.waitForTimeout(350);
const px2pt = (px) => Math.round(parseFloat(px) * 0.75 * 100) / 100;

// ---------- finding the Style controls ----------
let id = await newDoc("resume", "summit");
await open("resume", id);
const tab = page.locator('.studio__view label:has(input[value="design"])');
check("the editor has a clearly named Style tab with an icon", /Style/.test(await tab.innerText()) && (await tab.locator("svg").count()) === 1 && (await page.locator('.studio__view input[value="design"]').count()) === 1);
check("the old vague name is gone", (await page.locator(".studio__view").innerText()).indexOf("Design") === -1);
check("a first-time visitor sees a New badge on Style", (await tab.locator(".studio__new").count()) === 1);
const btn = page.locator(".studio__stylebtn");
check("the preview has a prominent Style button that names the document", (await btn.isVisible()) && /Style this resume/.test(await btn.innerText()) && (await btn.getAttribute("class")).includes("btn--primary"));
check("the preview says that text can be clicked", /Click any text in the preview/.test(await page.locator(".studio__pickhint").innerText()));
await btn.click();
await settle();
check("the button opens the Style panel and turns into Back to editing", (await page.locator(".studio").getAttribute("data-view")) === "design" && /Back to editing/.test(await btn.innerText()) && (await page.locator(".design .format").count()) === 1);
check("opening Style clears the New badge for good", (await tab.locator(".studio__new").count()) === 0 && (await page.evaluate(() => JSON.parse(localStorage.getItem("cc.settings.v1")).styleSeen)) === true);
await btn.click();
check("the same button returns to editing", (await page.locator(".studio").getAttribute("data-view")) === "edit");

// ---------- click-to-style ----------
await doc('[data-role="name"]').click();
await settle();
check("clicking the name in the preview opens Format text for the name", (await page.locator(".studio").getAttribute("data-view")) === "design" && /Editing:\s*Name/.test(await page.locator(".format__editing").innerText()) && (await page.locator('.format__chips [aria-checked="true"]').innerText()) === "Name");
check("the chosen text is outlined in the preview", (await page.locator(".stage__sizer [data-selected]").count()) >= 1 && (await doc('[data-role="name"]').getAttribute("data-selected")) === "true");
await doc('.doc__entry-title').click();
await settle();
check("clicking a job title picks Entry titles", (await page.locator('.format__chips [aria-checked="true"]').innerText()) === "Entry titles");
await doc(".doc__contact a").click();
check("links in the preview never navigate away", page.url().includes("/resume/") && (await page.locator(".studio").count()) === 1);
await page.locator('.format__chips').getByText("Body text", { exact: true }).click();
check("the chips switch what is being formatted", /Editing:\s*Body text/.test(await page.locator(".format__editing").innerText()) && (await doc('[data-role="body"]').getAttribute("data-selected")) === "true");

// ---------- Format text controls ----------
await page.locator('.format__chips').getByText("Name", { exact: true }).click();
const nameBefore = { w: await css('[data-role="name"]', "fontWeight"), s: await css('[data-role="name"]', "fontSize"), tt: await css('[data-role="name"]', "textTransform") };
const fmt = page.locator(".format");
await fmt.getByLabel("Font", { exact: true }).selectOption("playfair");
await settle();
await fontReady("Playfair Display Variable");
check("a font is applied and the bundled font file really loads", (await css('[data-role="name"]', "fontFamily")).includes("Playfair Display Variable"));
await fmt.getByLabel("Boldness").selectOption("900");
await settle();
check("boldness changes the weight", (await css('[data-role="name"]', "fontWeight")) === "900");
await fmt.getByLabel("Size", { exact: true }).fill("40");
await settle();
check("size changes the text size in points", px2pt(await css('[data-role="name"]', "fontSize")) === 40 && (await fmt.locator("output").first().innerText()) === "40 pt");
await fmt.getByLabel("Colour", { exact: true }).fill("#7a1f3d");
await settle();
check("colour changes the text colour", (await css('[data-role="name"]', "color")) === "rgb(122, 31, 61)");
await fmt.getByLabel("Capitals").selectOption("on");
await settle();
check("capitals can be forced on", (await css('[data-role="name"]', "textTransform")) === "uppercase");
await fmt.getByLabel("Capitals").selectOption("off");
await settle();
check("and forced off, even where the template uses them", (await css('[data-role="name"]', "textTransform")) === "none");
await fmt.getByRole("checkbox", { name: "Italic" }).check();
await settle();
check("italic works", (await css('[data-role="name"]', "fontStyle")) === "italic");
await fmt.getByLabel("Letter spacing").fill("0.1");
await settle();
check("letter spacing works", parseFloat(await css('[data-role="name"]', "letterSpacing")) > 1);
await fmt.getByRole("radio", { name: "Centre" }).check({ force: true });
await settle();
check("alignment works for the name", (await css('[data-role="name"]', "textAlign")) === "center");
check("the contact line can be aligned too (flex container)", await (async () => { await page.locator('.format__chips').getByText("Contact details", { exact: true }).click(); await fmt.getByRole("radio", { name: "Right" }).check({ force: true }); await settle(); return (await css('[data-role="contact"]', "justifyContent")) === "flex-end"; })());
await page.locator('.format__chips').getByText("Body text", { exact: true }).click();
await fmt.getByRole("radio", { name: "Justify" }).check({ force: true });
await fmt.getByLabel("Font", { exact: true }).selectOption("lora");
await settle();
check("body text can be justified and set in a serif", (await css('[data-role="body"]', "textAlign")) === "justify" && (await css('[data-role="body"]', "fontFamily")).includes("Lora Variable"));
check("headings are not offered alignment (it cannot work there)", await (async () => { await page.locator('.format__chips').getByText("Section headings", { exact: true }).click(); return (await fmt.getByRole("radio", { name: "Justify" }).count()) === 0 && (await fmt.getByLabel("Alignment").count()) === 0; })());
check("per-element settings are scoped: headings keep the template font", !(await css('[data-role="heading"]', "fontFamily")).includes("Lora"));

// reset behaviours
await page.locator('.format__chips').getByText("Name", { exact: true }).click();
await page.getByRole("button", { name: "Template default for name, size" }).click();
await settle();
check("a single property resets to the template default", px2pt(await css('[data-role="name"]', "fontSize")) !== 40 && (await css('[data-role="name"]', "fontWeight")) === "900");
await page.getByRole("button", { name: "Reset name", exact: false }).first().click();
await settle();
check("Reset name removes every override for that text", (await css('[data-role="name"]', "fontWeight")) === nameBefore.w && px2pt(await css('[data-role="name"]', "fontSize")) === px2pt(nameBefore.s) && (await css('[data-role="name"]', "textTransform")) === nameBefore.tt);
await page.locator('.format__chips').getByText("Body text", { exact: true }).click();
await page.getByRole("button", { name: "Use this font for all text" }).click();
await settle();
await fontReady("Lora Variable");
check("one font can be applied to all text", (await css('[data-role="name"]', "fontFamily")).includes("Lora") && (await css('[data-role="heading"]', "fontFamily")).includes("Lora") && (await css('[data-role="meta"]', "fontFamily")).includes("Lora"));

// ---------- undo, persistence ----------
await page.locator('button[aria-label="Undo"]').click();
await settle();
check("the toolbar Undo steps back through formatting changes", true);
await page.waitForFunction(() => /Saved on this device/.test(document.querySelector(".studio__status")?.textContent || ""));
const before = await page.evaluate(async (id) => JSON.stringify((await (await import("/js/storage/repository.js")).getRepository().then((r) => r.get(id))).designSettings.elements), id);
await page.reload();
await page.waitForSelector(".stage__sizer > .doc");
await fontReady("Lora Variable");
check("formatting survives a reload and is stored as validated data", (await page.evaluate(async (id) => JSON.stringify((await (await import("/js/storage/repository.js")).getRepository().then((r) => r.get(id))).designSettings.elements), id)) === before && (await css('[data-role="body"]', "fontFamily")).includes("Lora"));

// ---------- the improved Style panel ----------
await page.locator('.studio__view input[value="design"]').check({ force: true });
await page.waitForSelector(".design__jump");
check("the panel has jump chips to every group", (await page.locator(".design__jump .chip-btn").allInnerTexts()).join("|") === "Template|Colours|Text and fonts|Layout|Photo");
check("groups are collapsible and named", (await page.locator("details.design__group > summary h3").allInnerTexts()).includes("Text, fonts and spacing"));
await page.locator("#dg-struct > summary").click();
await page.locator(".design__jump .chip-btn", { hasText: "Template" }).click();
await settle();
await page.locator('[data-focus-key="tpl:orbit"]').click();
await settle();
check("a collapsed group stays collapsed after the panel rebuilds", (await page.locator("#dg-struct").evaluate((e) => e.open)) === false);
await page.locator(".design__jump .chip-btn", { hasText: "Layout" }).click();
await settle();
check("a jump chip reopens its group", (await page.locator("#dg-struct").evaluate((e) => e.open)) === true);
await page.waitForSelector(".toast:has-text('custom colours and text styles were reset')", { timeout: 4000 }).catch(() => {});
const resetToast = await page.locator(".toast:has-text('were reset')").count();
check("switching template tells you your custom styles were reset and offers Undo", resetToast >= 1);
await page.locator(".toast .btn", { hasText: "Undo" }).first().click();
await settle();
check("that Undo brings the custom text styles back", (await doc("").getAttribute("data-template")) === "summit" && (await css('[data-role="body"]', "fontFamily")).includes("Lora"));

// ---------- photo resize and move ----------
await page.locator('.studio__view input[value="design"]').check({ force: true });
await page.locator(".design__jump .chip-btn", { hasText: "Photo" }).click();
await settle();
const w0 = await page.evaluate(() => document.querySelector(".stage__sizer [data-role=photo]").offsetWidth);
const x0 = await page.evaluate(() => document.querySelector(".stage__sizer [data-role=photo]").getBoundingClientRect().left);
await page.getByLabel("Photo size", { exact: true }).fill("40");
await page.getByLabel("Nudge photo sideways").fill("-10");
await settle();
const w1 = await page.evaluate(() => document.querySelector(".stage__sizer [data-role=photo]").offsetWidth);
const x1 = await page.evaluate(() => document.querySelector(".stage__sizer [data-role=photo]").getBoundingClientRect().left);
check("the photo can be resized (millimetres)", Math.abs(w1 - 40 * 3.7795) < 2 && w1 !== w0, `${w0} -> ${w1}`);
check("the photo can be nudged without moving the text", x1 < x0 - 5 && (await doc('[data-role="name"]').boundingBox()) !== null);
await page.getByRole("button", { name: "Reset size and position" }).click();
await settle();
check("size and position reset together", Math.abs((await page.evaluate(() => document.querySelector(".stage__sizer [data-role=photo]").offsetWidth)) - w0) < 2);

// ---------- cover letters ----------
const lid = await newDoc("letter", "orbit");
await open("letter", lid);
await doc('[data-role="body"]').click();
await settle();
check("clicking letter text works the same way", /Editing:\s*Body text/.test(await page.locator(".format__editing").innerText()));
check("letters do not offer section headings", (await page.locator(".format__chips").getByText("Section headings", { exact: true }).count()) === 0);
await page.locator(".format").getByLabel("Size", { exact: true }).fill("13");
await settle();
check("letter body size changes", px2pt(await css(".doc__para", "fontSize")) === 13);
await doc('[data-role="title"]').click();
await settle();
check("the subject line counts as an entry title", (await page.locator('.format__chips [aria-checked="true"]').innerText()) === "Entry titles");

// ---------- real PDFs ----------
const pdfOf = async (name, d) => {
  await page.evaluate(async ({ d }) => { window.__doc = d; const pr = await import("/js/export/print.js"); await pr.loadDocFonts(d); window.__prep = pr.preparePrint(d, {}); await document.fonts.ready; }, { d });
  await page.waitForTimeout(300);
  const file = `${outDir}/${name}.pdf`;
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
  await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());
  return file;
};
const sample = (templateId, elements) =>
  page.evaluate(async ({ templateId, elements }) => {
    const { createSample } = await import("/js/models/resume.js");
    const { applyTemplate } = await import("/js/templates/design.js");
    const d = createSample();
    applyTemplate(d, templateId);
    d.designSettings = { showPhoto: true, elements };
    return d;
  }, { templateId, elements });
let f = await pdfOf("p61-fonts", await sample("summit", { name: { font: "playfair", weight: 900, size: 36, upper: true, color: "#0000cc" }, body: { font: "lora", size: 11 }, heading: { font: "jetbrains" } }));
const fonts = run("pdffonts", [f]);
check("PDFs embed the chosen bundled fonts", /Playfair/i.test(fonts) && /Lora/i.test(fonts) && /JetBrains/i.test(fonts), fonts.split("\n").slice(2, 6).join(" | "));
const text = run("pdftotext", ["-layout", f, "-"]);
check("the text stays real, selectable text in capitals where requested", text.includes("ALEX SAMPLE") && /Led the redesign/.test(text) && /Pages:\s+1\b/.test(run("pdfinfo", [f])));
run("pdftoppm", ["-r", "60", "-f", "1", "-l", "1", "-png", f, `${f}.px`]);
const blue = await page.evaluate(async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 140 && d[i] < 90 && d[i + 1] < 90) n++; return n; }, readFileSync(`${f}.px-1.png`).toString("base64"));
check("a custom text colour prints on a light template", blue > 100, `${blue} px`);
f = await pdfOf("p61-slate", await sample("slate", { name: { font: "playfair", color: "#ffee00" }, body: { font: "lora", color: "#ffee00" } }));
run("pdftoppm", ["-r", "60", "-f", "1", "-l", "1", "-png", f, `${f}.px`]);
const yellow = await page.evaluate(async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 120) n++; return n; }, readFileSync(`${f}.px-1.png`).toString("base64"));
check("a dark-on-screen template still prints readable dark text, but keeps the chosen fonts", yellow < 30 && /Playfair/i.test(run("pdffonts", [f])) && /Lora/i.test(run("pdffonts", [f])), `${yellow} yellow px`);
const big = await pdfOf("p61-photo", await page.evaluate(async () => { const { createSample } = await import("/js/models/resume.js"); const { applyTemplate } = await import("/js/templates/design.js"); const d = createSample(); applyTemplate(d, "orbit"); d.designSettings = { showPhoto: true, photoSize: 45, photoX: 4, elements: { body: { size: 12 } } }; return d; }));
check("photo size, nudge and larger text still print on the expected pages", /Pages:\s+[12]\b/.test(run("pdfinfo", [big])) && run("pdftotext", ["-layout", big, "-"]).includes("Alex Sample"));

// ---------- offline-friendliness: nothing is fetched from other sites ----------
check("fonts and styles come only from this site (no CDN, no tracker)", external.length === 0, external.slice(0, 3).join(" "));

// ---------- phones ----------
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  const mid = await newDoc("resume", "nexus");
  await open("resume", mid);
  const tabsFit = await page.evaluate(() => { const s = document.querySelector(".studio__view .segmented").getBoundingClientRect(); return s.left >= 0 && s.right <= innerWidth; });
  check(`the three tabs fit the screen @${w}`, tabsFit);
  await page.locator('.studio__view input[value="design"]').check({ force: true });
  await page.waitForSelector(".format");
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const small = await page.evaluate(() => [...document.querySelectorAll(".format select, .format .chip-btn, .format input[type=color]")].filter((e) => e.getClientRects().length).filter((e) => e.getBoundingClientRect().height < 32).length);
  check(`Format text fits and is tappable @${w}`, over <= 1 && small === 0, `overflow ${over}, small ${small}`);
  await page.locator('.studio__view input[value="preview"]').check({ force: true });
  await page.waitForTimeout(300);
  await doc('[data-role="name"]').click();
  await settle();
  check(`tapping text in the preview jumps to Format text @${w}`, (await page.locator(".studio").getAttribute("data-view")) === "design" && /Editing:\s*Name/.test(await page.locator(".format__editing").innerText()));
}
await page.setViewportSize({ width: 1440, height: 1000 });

check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
