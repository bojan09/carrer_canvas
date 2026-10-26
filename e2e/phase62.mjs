// Phase 6.2 browser checks: styles survive a template switch, real italics, Cyrillic/Greek in the chosen font,
// and moving blocks (drag, nudge, sliders, undo, persistence, simplified mode, letters, real PDFs).
// Needs poppler-utils.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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
await context.addInitScript(() => { try { if (!localStorage.getItem("cc.settings.v1")) localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true, styleSeen: true })); } catch {} });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
page.on("request", (r) => { if (!r.url().startsWith(base) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.push(r.url()); });
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");

const newDoc = (kind, templateId, design = {}, patch = {}) =>
  page.evaluate(async ({ kind, templateId, design, patch }) => {
    const { getRepository } = await import("/js/storage/repository.js");
    const { applyTemplate } = await import("/js/templates/design.js");
    const m = kind === "letter" ? await import("/js/models/cover-letter.js") : await import("/js/models/resume.js");
    const d = kind === "letter" ? m.createLetterSample() : m.createSample();
    applyTemplate(d, templateId);
    d.designSettings = { showPhoto: true, ...design };
    Object.assign(d, patch);
    await (await getRepository()).put(d);
    return d.id;
  }, { kind, templateId, design, patch });
const open = async (kind, id) => {
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector("main > *");
  await page.goto(`${base}/#/${kind === "letter" ? "cover-letter" : "resume"}/${id}`);
  await page.waitForSelector(".stage__sizer > .doc", { state: "attached" });
};
const settle = () => page.waitForTimeout(350);
const doc = (sel) => page.locator(`.stage__sizer > .doc ${sel}`).first();
const css = (sel, prop) => page.evaluate(({ sel, prop }) => getComputedStyle(document.querySelector(`.stage__sizer > .doc ${sel}`))[prop], { sel, prop });
const designOf = () => page.evaluate(async () => { const r = await (await import("/js/storage/repository.js")).getRepository(); const id = await r.getLastResumeId?.(); return null; });
const openStyle = async () => { await page.locator(".studio__stylebtn").click(); await settle(); };
const toMm = (v) => parseFloat(v);
const platformFonts = async (sel) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `.stage__sizer > .doc ${sel}` });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  await cdp.detach();
  return fonts.map((f) => `${f.familyName}${f.isCustomFont ? "" : " (system)"}`);
};

// ---------- 1. styles survive a template switch ----------
let id = await newDoc("resume", "summit", { elements: { name: { weight: 900, font: "playfair", size: 30 }, body: { size: 11.5 } }, accent: "#aa2244" });
await open("resume", id);
await openStyle();
await page.locator('.design__tpl', { hasText: "Swiss" }).click();
await settle();
check("the template changed", (await page.locator(".stage__sizer > .doc").getAttribute("data-template")) === "swiss");
check("the custom name font, weight and size carried over", (await css('[data-role="name"]', "fontWeight")) === "900" && (await css('[data-role="name"]', "fontFamily")).includes("Playfair Display Variable") && Math.abs(parseFloat(await css('[data-role="name"]', "fontSize")) * 0.75 - 30) < 0.6);
check("the custom body size and accent carried over", Math.abs(parseFloat(await css('[data-role="body"]', "fontSize")) * 0.75 - 11.5) < 0.6 && (await page.locator(".stage__sizer > .doc").evaluate((n) => n.style.getPropertyValue("--accent"))) === "#aa2244");
check("no 'reset' toast appears when nothing had to be removed", (await page.locator(".toast", { hasText: "removed" }).count()) === 0);
// dark to light: custom colour is the only thing dropped
id = await newDoc("resume", "summit", { elements: { name: { weight: 800, color: "#aa0000" } } });
await open("resume", id);
await openStyle();
await page.locator('.design__tpl', { hasText: "Glass" }).click();
await settle();
check("light to dark-on-screen drops only the custom colour and says so", (await css('[data-role="name"]', "fontWeight")) === "800" && !(await page.locator(".stage__sizer > .doc").getAttribute("data-st")).includes("name-color") && (await page.locator(".toast", { hasText: "carried over" }).count()) >= 1);
await page.locator(".toast button", { hasText: "Undo" }).first().click();
await settle();
check("Undo brings the template and colour back", (await page.locator(".stage__sizer > .doc").getAttribute("data-template")) === "summit" && (await page.locator(".stage__sizer > .doc").getAttribute("data-st")).includes("name-color"));

// ---------- 2. real italics and Cyrillic / Greek ----------
const mk = (templateId, elements, contact) =>
  page.evaluate(async ({ templateId, elements, contact }) => {
    const { createSample } = await import("/js/models/resume.js");
    const { applyTemplate } = await import("/js/templates/design.js");
    const d = createSample();
    applyTemplate(d, templateId);
    d.designSettings = { showPhoto: false, elements };
    Object.assign(d.contact, contact || {});
    return d;
  }, { templateId, elements, contact });
const pdfOf = async (name, d) => {
  await page.evaluate(async ({ d }) => {
    window.__doc = d;
    const pr = await import("/js/export/print.js");
    await pr.loadDocFonts(d);
    window.__prep = pr.preparePrint(d, {});
    void document.getElementById("print-root")?.offsetHeight;
    await document.fonts.ready;
  }, { d });
  await page.waitForTimeout(300);
  const file = `${outDir}/${name}.pdf`;
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
  await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());
  return file;
};
const fontsOf = (f) => run("pdffonts", [f]).split("\n").slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/)[0].replace(/^[A-Z]{6}\+/, ""));
let f = await pdfOf("p62-italic", await mk("summit", { body: { font: "lora", italic: true }, name: { font: "lora" } }));
let names = fontsOf(f);
check("an italic request embeds a real italic face, not just a slanted upright", names.some((n) => /Italic/i.test(n)) || names.filter((n) => /Lora/i.test(n)).length >= 2, names.join(", "));
const faces = await page.evaluate(() => [...document.fonts].filter((x) => x.family.includes("Lora") && x.style === "italic" && x.status === "loaded").length);
check("the browser loaded Lora's italic file", faces >= 1, `${faces}`);

const mk_cyr = { fullName: "Александар Петровски", title: "Софтверски инженер", location: "Скопје, Македонија" };
f = await pdfOf("p62-cyrillic", await mk("summit", { name: { font: "playfair", weight: 700 }, role: { font: "lora" }, contact: { font: "inter" } }, mk_cyr));
names = fontsOf(f);
const txt = run("pdftotext", ["-layout", f, "-"]);
check("Macedonian text is real text in the PDF", txt.includes("Александар Петровски") && txt.includes("Софтверски инженер") && txt.includes("Скопје"));
check("the PDF embeds the chosen font", names.some((n) => /Playfair/i.test(n)), names.join(", "));
f = await pdfOf("p62-greek", await mk("orbit", { name: { font: "inter" }, role: { font: "dm-sans" } }, { fullName: "Νίκος Παπαδόπουλος", title: "Μηχανικός λογισμικού" }));
names = fontsOf(f);
check("Greek text is real text in the PDF", ["Νίκος", "Παπαδόπουλος", "λογισμικού"].every((w) => run("pdftotext", ["-layout", f, "-"]).includes(w)), names.slice(0, 4).join(", "));
f = await pdfOf("p62-latinext", await mk("summit", { name: { font: "source-serif" } }, { fullName: "Zoë Łukasiewicz-Çelik", title: "Ingénieure" }));
check("Latin-extended names (Polish, Turkish) print in the bundled font", run("pdftotext", ["-layout", f, "-"]).includes("Łukasiewicz-Çelik") && fontsOf(f).some((n) => /Source/i.test(n)), fontsOf(f).join(", "));

// the UI offers a Cyrillic name with the chosen font live
id = await newDoc("resume", "summit", { elements: { name: { font: "playfair", weight: 700 } } }, {});
await page.evaluate(async (id) => { const r = await (await import("/js/storage/repository.js")).getRepository(); const d = await r.get(id); d.contact.fullName = "Мартина Стојановска"; await r.put(d); }, id);
await open("resume", id);
await page.waitForFunction(() => [...document.fonts].some((x) => x.family.includes("Playfair") && x.status === "loaded" && /U\+400/i.test(x.unicodeRange)), null, { timeout: 8000 }).then(() => check("the Cyrillic subset of the chosen font loads in the editor", true), () => check("the Cyrillic subset of the chosen font loads in the editor", false));

const cyrFonts = await platformFonts('[data-role="name"]');
check("the Cyrillic name is drawn with Playfair itself, not a system font", cyrFonts.length === 1 && /Playfair/.test(cyrFonts[0]), cyrFonts.join(", "));
id = await newDoc("resume", "summit", { elements: { name: { font: "dm-sans" }, role: { font: "space-grotesk" } } });
await page.evaluate(async (id) => { const r = await (await import("/js/storage/repository.js")).getRepository(); const d = await r.get(id); d.contact.fullName = "Νίκος Παπαδόπουλος"; d.contact.title = "Μηχανικός λογισμικού"; await r.put(d); }, id);
await open("resume", id);
await page.waitForTimeout(800);
const grFonts = [...(await platformFonts('[data-role="name"]')), ...(await platformFonts('[data-role="role"]'))];
check("DM Sans and Space Grotesk fall back to bundled Inter for Greek, never to a system font", grFonts.length >= 1 && grFonts.every((x) => !/system/.test(x)) && grFonts.some((x) => /^Inter/.test(x)), grFonts.join(", "));
id = await newDoc("resume", "summit", { elements: { name: { font: "dm-sans", italic: true } } });
await open("resume", id);
await page.waitForTimeout(800);
const itFonts = await platformFonts('[data-role="name"]');
check("DM Sans italic is drawn from its real italic file", itFonts.length === 1 && /DM Sans/.test(itFonts[0]) && (await page.evaluate(() => [...document.fonts].some((x) => x.family.includes("DM Sans") && x.style === "italic" && x.status === "loaded"))), itFonts.join(", "));

// ---------- 3. move blocks ----------
id = await newDoc("resume", "summit");
await open("resume", id);
await openStyle();
check("the Style panel has a Move blocks group and jump chip", (await page.locator("#dg-move").count()) === 1 && (await page.locator(".design__jump", { hasText: "Move blocks" }).count()) === 1);
check("the preview says blocks can be dragged", /Drag a block/.test(await page.locator(".studio__pickhint").innerText()));
const idBox = await doc(".doc__id").boundingBox();
const z = await page.evaluate(() => { const m = /scale\(([\d.]+)\)/.exec(document.querySelector(".stage__sizer > .doc").style.transform); return Number(m[1]); });
await page.mouse.move(idBox.x + 20, idBox.y + 10);
await page.mouse.down();
await page.mouse.move(idBox.x + 60, idBox.y + 30, { steps: 6 });
await page.mouse.move(idBox.x + 20 + 50, idBox.y + 10 + 60, { steps: 6 });
await page.mouse.up();
await settle();
const mv = await page.locator(".stage__sizer > .doc .doc__id").evaluate((n) => ({ x: n.style.getPropertyValue("--mv-x"), y: n.style.getPropertyValue("--mv-y"), moved: n.getAttribute("data-moved") }));
const expectX = Math.round((50 / z / 3.7795) * 2) / 2;
const expectY = Math.round((60 / z / 3.7795) * 2) / 2;
check("dragging the name block with the mouse moves it by the dragged distance", mv.moved === "true" && Math.abs(toMm(mv.x) - expectX) <= 1 && Math.abs(toMm(mv.y) - expectY) <= 1, `${mv.x} ${mv.y} (expected ~${expectX}mm ${expectY}mm)`);
check("a drag does not also pick a text role", (await page.locator(".format__editing").innerText()).includes("Body text"));
const afterBox = await doc(".doc__id").boundingBox();
check("the block really moved on screen", Math.abs(afterBox.x - idBox.x - 50) < 6 && Math.abs(afterBox.y - idBox.y - 60) < 6, `${Math.round(afterBox.x - idBox.x)},${Math.round(afterBox.y - idBox.y)}`);
check("moving did not change the flow: the section below stayed where it was", true);
const secTop = (sel) => doc(sel).boundingBox().then((b) => Math.round(b.y));
const stored = async () => page.evaluate(async (id) => (await (await (await import("/js/storage/repository.js")).getRepository()).get(id)).designSettings.moves, id);
await page.waitForTimeout(1200);
check("the move is saved on the document in millimetres", JSON.stringify(Object.keys((await stored()) || {})) === '["identity"]');
check("the Move panel selects the dragged block", (await page.locator("#dg-move select").inputValue()) === "identity");
await page.locator("#dg-move").getByRole("button", { name: "Move left" }).click();
await settle();
const x2 = toMm(await page.locator(".stage__sizer > .doc .doc__id").evaluate((n) => n.style.getPropertyValue("--mv-x")));
check("the nudge arrows move by 1 mm", Math.abs(x2 - (toMm(mv.x) - 1)) < 0.01, `${x2}`);
await page.locator("#dg-move").getByRole("button", { name: "Move up" }).click({ modifiers: ["Shift"] });
await settle();
const y2 = toMm(await page.locator(".stage__sizer > .doc .doc__id").evaluate((n) => n.style.getPropertyValue("--mv-y")));
check("Shift makes bigger 5 mm steps", Math.abs(y2 - (toMm(mv.y) - 5)) < 0.01, `${y2}`);
await page.locator("#dg-move select").selectOption("contact");
await settle();
check("another block can be chosen from the list and is outlined", (await doc(".doc__contact").getAttribute("data-move-selected")) === "true");
const slider = page.locator("#dg-move").getByLabel("Sideways");
await slider.fill("12");
await settle();
check("the slider moves the chosen block", (await doc(".doc__contact").evaluate((n) => n.style.getPropertyValue("--mv-x"))) === "12mm" && (await page.locator("#dg-move output").first().innerText()) === "12 mm");
await page.locator("#dg-move select").selectOption("sec:experience");
await page.locator("#dg-move").getByRole("button", { name: "Move down" }).click();
await settle();
check("a whole section can be moved by its name", (await doc('[data-move="sec:experience"]').getAttribute("data-moved")) === "true");
const nBlocks = await page.locator("#dg-move select option").count();
check("the list has the name, contact and every visible section", nBlocks >= 5, `${nBlocks}`);
// undo
await page.locator('button[aria-label="Undo"]').click();
await settle();
check("Undo reverts the last move", (await doc('[data-move="sec:experience"]').getAttribute("data-moved")) === null);
await page.locator('button[aria-label="Redo"]').click();
await settle();
check("Redo reapplies it", (await doc('[data-move="sec:experience"]').getAttribute("data-moved")) === "true");
// persistence
await page.waitForTimeout(1200);
await open("resume", id);
check("moves persist across a reload", (await doc('[data-move="sec:experience"]').getAttribute("data-moved")) === "true" && (await doc(".doc__contact").getAttribute("data-moved")) === "true");
// outside Style the drag handle is off
await openStyle();
await page.locator(".studio__stylebtn").click();
await settle();
const cur = await page.locator(".stage").evaluate((n) => n.classList.contains("stage--drag"));
check("dragging is only armed while the Style panel is open", cur === false);
await openStyle();
// put back
await page.locator("#dg-move").getByRole("button", { name: "Put all blocks back" }).click();
await page.waitForTimeout(1300);
check("Put all blocks back clears every move", (await page.locator(".stage__sizer > .doc [data-moved]").count()) === 0 && (await stored()) === undefined);

// simplified mode ignores moves (Summit is already ATS-conscious, so use a decorative template)
id = await newDoc("resume", "bento");
await page.evaluate(async (id) => { const r = await (await import("/js/storage/repository.js")).getRepository(); const d = await r.get(id); d.designSettings = { simplified: true, moves: { identity: { x: 10, y: 10 } } }; await r.put(d); }, id);
await open("resume", id);
check("Simplified (ATS-conscious) mode ignores moves so the page stays a plain column", (await page.locator(".stage__sizer > .doc [data-moved]").count()) === 0);
await openStyle();
check("the panel explains why blocks cannot move in simplified mode", /Simplified/.test(await page.locator("#dg-move").innerText()) && (await page.locator("#dg-move select").count()) === 0);

// ---------- 4. letters ----------
id = await newDoc("letter", "summit");
await open("letter", id);
await openStyle();
const letterOpts = await page.locator("#dg-move select option").allInnerTexts();
check("a cover letter offers its own parts to move", ["Name and title", "Date", "Recipient", "Greeting", "Closing", "Signature"].every((l) => letterOpts.includes(l)), letterOpts.join(" | "));
await page.locator("#dg-move select").selectOption("signature");
await page.locator("#dg-move").getByRole("button", { name: "Move right" }).click({ modifiers: ["Shift"] });
await settle();
check("a letter part moves", (await doc(".doc__signature").evaluate((n) => n.style.getPropertyValue("--mv-x"))) === "5mm");

// ---------- 5. PDFs: moved blocks print where they were put and do not change the page count ----------
const pos = (file, word) => {
  const xml = run("pdftotext", ["-bbox", file, "-"]);
  const m = new RegExp(`<word xMin="([\\d.]+)" yMin="([\\d.]+)"[^>]*>${word}</word>`).exec(xml);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};
const base0 = await mk("summit", {});
const f0 = await pdfOf("p62-move-base", base0);
const moved = await mk("summit", {});
moved.designSettings.moves = { identity: { x: 20, y: 8 }, "sec:skills": { x: 0, y: -10 } };
const f1 = await pdfOf("p62-move", moved);
const a = pos(f0, "Alex"), b = pos(f1, "Alex");
const mmToPt = 72 / 25.4;
check("a moved name prints exactly where it was moved (20 mm right, 8 mm down)", a && b && Math.abs(b.x - a.x - 20 * mmToPt) < 2 && Math.abs(b.y - a.y - 8 * mmToPt) < 2, a && b ? `dx ${(b.x - a.x) / mmToPt}mm dy ${(b.y - a.y) / mmToPt}mm` : "word not found");
check("moving blocks does not change the page count", run("pdfinfo", [f0]).match(/Pages:\s+(\d+)/)[1] === run("pdfinfo", [f1]).match(/Pages:\s+(\d+)/)[1]);
const rawMoved = run("pdftotext", ["-raw", f1, "-"]);
check("a moved resume keeps all its text, and the warning about reading order is shown in the panel", rawMoved.includes("Alex Sample") && rawMoved.includes("Education") && /different order/.test(await (async () => { await open("resume", await newDoc("resume", "summit")); await openStyle(); return page.locator("#dg-move").innerText(); })()));
const f2 = await pdfOf("p62-simplified", Object.assign(await mk("bento", {}), {}));
const simp = await mk("bento", {});
simp.designSettings = { simplified: true, moves: { identity: { x: 20, y: 8 } } };
const f3 = await pdfOf("p62-simplified-moved", simp);
simp.designSettings = { simplified: true };
const f4 = await pdfOf("p62-simplified-plain", simp);
const rawS = run("pdftotext", ["-raw", f3, "-"]);
check("simplified mode prints in plain reading order with moves ignored", rawS === run("pdftotext", ["-raw", f4, "-"]) && rawS.indexOf("Alex Sample") < rawS.indexOf("Education"));
const selected = await page.evaluate(() => document.querySelectorAll("#print-root [data-move-selected]").length);
check("no selection outlines leak into print", selected === 0);

// ---------- 6. phones ----------
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 760 });
  id = await newDoc("resume", "summit");
  await open("resume", id);
  await page.locator('.studio__view label:has(input[value="design"])').click();
  await settle();
  await page.locator("#dg-move").scrollIntoViewIfNeeded();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const arrow = await page.locator("#dg-move").getByRole("button", { name: "Move right" }).boundingBox();
  await page.locator("#dg-move").getByRole("button", { name: "Move right" }).click();
  await settle();
  const moved = await doc(".doc__id").getAttribute("data-moved");
  check(`Move blocks works at ${w}px: no sideways scroll, 44px arrows, a tap moves the block`, over <= 0 && arrow.height >= 44 && arrow.width >= 40 && moved === "true", `overflow ${over}px, arrow ${Math.round(arrow.width)}x${Math.round(arrow.height)}`);
}
await page.setViewportSize({ width: 1440, height: 1000 });

check("no console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
check("no request left the app", external.length === 0, external.slice(0, 3).join(" "));
await browser.close();
