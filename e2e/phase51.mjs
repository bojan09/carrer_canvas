// Phase 5.1 browser checks: text colour, fill colour, transparency, flip layout and letter date side,
// in the real design panel, the preview, after reload, and in real PDFs. Needs poppler-utils.
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
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-GB" });
await context.addInitScript(() => { try { if (!localStorage.getItem("cc.settings.v1")) localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true })); } catch {} }); // the first-run tour has its own tests (phase6)
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");

const newDoc = (kind, templateId) =>
  page.evaluate(async ({ kind, templateId }) => {
    const { getRepository } = await import("/js/storage/repository.js");
    const { applyTemplate } = await import("/js/templates/design.js");
    const m = kind === "letter" ? await import("/js/models/cover-letter.js") : await import("/js/models/resume.js");
    const d = kind === "letter" ? m.createLetterSample() : m.createSample();
    applyTemplate(d, templateId);
    d.designSettings.showPhoto = true;
    await (await getRepository()).put(d);
    return d.id;
  }, { kind, templateId });

const openDoc = async (kind, id) => {
  await page.goto(`${base}/#/${kind === "letter" ? "cover-letter" : "resume"}/${id}`);
  await page.waitForSelector(".stage__sizer > .doc");
  await page.locator('.studio__view input[value="design"]').check({ force: true });
  await page.waitForSelector(".design .design__tpl");
};
const pickTemplate = async (id) => {
  await page.locator(`[data-focus-key="tpl:${id}"]`).click();
  await page.waitForTimeout(220);
};
const docVar = (name) => page.evaluate((n) => document.querySelector(".stage__sizer > .doc").style.getPropertyValue(n), name);
const docAttr = (name) => page.locator(".stage__sizer > .doc").getAttribute(name);
const css = (sel, prop) => page.evaluate(({ sel, prop }) => getComputedStyle(document.querySelector(`.stage__sizer > .doc ${sel}`))[prop], { sel, prop });
const centreX = (sel) => page.evaluate((sel) => { const d = document.querySelector(".stage__sizer > .doc"); const e = d.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const dr = d.getBoundingClientRect(); return (r.left + r.width / 2 - dr.left) / dr.width; }, sel);

// ---------- panel and live preview ----------
let id = await newDoc("resume", "orbit");
await openDoc("resume", id);
check("design panel has the text colour, fill, transparency and flip controls", (await page.getByLabel("Text colour", { exact: true }).count()) === 1 && (await page.getByLabel("Secondary text colour", { exact: true }).count()) === 1 && (await page.getByLabel("Background fill colour", { exact: true }).count()) === 1 && (await page.getByLabel("Background decoration opacity", { exact: true }).count()) === 1 && (await page.getByLabel("Photo opacity", { exact: true }).count()) === 1 && (await page.getByRole("checkbox", { name: /Flip layout/ }).count()) === 1);
check("controls start at the template's own look (no overrides set)", (await docVar("--ink")) === "" && (await docVar("--fill-o")) === "" && (await docVar("--photo-o")) === "" && (await docAttr("data-mirror")) === "false");
const inkBefore = await css(".doc__entry-title", "color");
await page.getByLabel("Text colour", { exact: true }).fill("#aa0000");
await page.waitForTimeout(300);
check("text colour changes the resume text live", (await css(".doc__entry-title", "color")) === "rgb(170, 0, 0)" && inkBefore !== "rgb(170, 0, 0)");
await page.getByLabel("Secondary text colour", { exact: true }).fill("#0000bb");
await page.waitForTimeout(300);
check("secondary text colour changes details live", (await css(".doc__entry-sub", "color")) === "rgb(0, 0, 187)");
const bgBefore = await css(".doc__header", "backgroundImage");
await page.getByLabel("Background fill colour", { exact: true }).fill("#0f766e");
await page.waitForTimeout(300);
const bgAfter = await css(".doc__header", "backgroundImage");
const [r, g] = (/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(bgAfter) || []).slice(1).map(Number);
check("fill colour recolours the decorative header fill (violet tint becomes teal tint)", (await docVar("--deco-c")) === "#0f766e" && bgAfter !== bgBefore && g > r + 0.03, bgAfter);
await page.getByLabel("Background decoration opacity", { exact: true }).fill("0.3");
await page.getByLabel("Photo opacity", { exact: true }).fill("0.5");
await page.waitForTimeout(300);
check("opacity sliders apply to fills and to the photo", (await docVar("--fill-o")) === "0.3" && (await css(".doc__photo", "opacity")) === "0.5");
check("the slider readouts show percentages", (await page.locator(".design output").allInnerTexts()).some((t) => t === "30%") && (await page.locator(".design output").allInnerTexts()).some((t) => t === "50%"));
const textNow = (await page.locator(".stage__sizer > .doc").innerText()).replace(/\s+/g, " ");
check("text content is unaffected by styling changes", textNow.includes("Senior Designer (sample)") && textNow.includes("Alex Sample"));

// ---------- reset, undo, persistence ----------
await page.getByRole("button", { name: "Use template colour for text colour" }).click();
await page.waitForTimeout(300);
check("a single colour can be reset to the template colour", (await docVar("--ink")) === "" && (await css(".doc__entry-title", "color")) === inkBefore && (await docVar("--deco-c")) === "#0f766e");
await page.locator('button[aria-label="Undo"]').click();
await page.waitForTimeout(300);
check("undo brings the colour back", (await css(".doc__entry-title", "color")) === "rgb(170, 0, 0)");
await page.waitForFunction(() => /Saved on this device/.test(document.querySelector(".studio__status")?.textContent || ""));
await page.reload();
await page.waitForSelector(".stage__sizer > .doc");
check("colours and opacity survive a reload", (await docVar("--ink")) === "#aa0000" && (await docVar("--deco-c")) === "#0f766e" && (await docVar("--fill-o")) === "0.3" && (await docVar("--photo-o")) === "0.5");
await page.locator('.studio__view input[value="design"]').check({ force: true });
await page.getByLabel("Text colour", { exact: true }).waitFor();
check("the panel shows the saved values", (await page.getByLabel("Text colour", { exact: true }).inputValue()) === "#aa0000" && (await page.getByLabel("Background decoration opacity", { exact: true }).inputValue()) === "0.3");

// ---------- readability guidance ----------
await page.getByLabel("Text colour", { exact: true }).fill("#fefefe");
await page.waitForTimeout(200);
const warn = page.locator(".colour .field__hint.is-warn").first();
check("a text colour with poor contrast gets a plain warning", (await warn.count()) === 1 && /low/i.test(await warn.innerText()));
await page.getByLabel("Text colour", { exact: true }).fill("#222222");
await page.waitForTimeout(200);
check("a readable colour clears the warning", (await page.locator(".colour .field__hint.is-warn").count()) === 0);

// ---------- header text adapts to the fill ----------
await pickTemplate("horizon");
await page.getByLabel("Background fill colour", { exact: true }).fill("#fde68a");
await page.waitForTimeout(300);
check("a pale fill switches header text to dark so it stays readable", (await docVar("--hdr-ink")) === "#111111" && (await css(".doc__name", "color")) === "rgb(17, 17, 17)");
await page.getByLabel("Background decoration opacity", { exact: true }).fill("1");
await page.getByLabel("Background fill colour", { exact: true }).fill("#1e293b");
await page.waitForTimeout(300);
check("a dark fill keeps header text light", (await docVar("--hdr-ink")) === "#ffffff");
check("the panel explains that header text adapts automatically", /switches between light and dark/.test(await page.locator(".design__group", { hasText: "Text colour and transparency" }).innerText()));

// ---------- templates without fills / dark templates ----------
await pickTemplate("summit");
check("switching template keeps the text colour but drops fills the new template does not have", (await docVar("--ink")) === "#222222" && (await docVar("--deco-c")) === "" && (await docVar("--hdr-ink")) === "");
check("a plain template disables fill controls and says why", (await page.getByLabel("Background fill colour", { exact: true }).isDisabled()) && (await page.getByLabel("Background decoration opacity", { exact: true }).isDisabled()) && /no decorative fills/.test(await page.locator(".design__group", { hasText: "Text colour and transparency" }).innerText()));
check("text colour still works on a plain template", !(await page.getByLabel("Text colour", { exact: true }).isDisabled()));
await pickTemplate("slate");
check("a dark-on-screen template explains that it prints on white", /prints on white with its own dark text/.test(await page.locator(".design__group", { hasText: "Text colour and transparency" }).innerText()));

// ---------- flip layout: header templates ----------
const HEADER = ["summit", "grid", "slate", "mono", "bento", "glass", "horizon", "nexus", "vertex"];
const flipped = [];
for (const t of HEADER) {
  await pickTemplate(t);
  const flipBox = page.getByRole("checkbox", { name: /Flip layout/ });
  if (await flipBox.isChecked()) { await flipBox.uncheck(); await page.waitForTimeout(250); } // flip now carries over a template switch
  const before = await centreX(".doc__photo");
  await page.getByRole("checkbox", { name: /Flip layout/ }).check();
  await page.waitForTimeout(250);
  const after = await centreX(".doc__photo");
  const movedSide = before !== null && after !== null && (before - 0.5) * (after - 0.5) < 0;
  if (!movedSide || (await docAttr("data-mirror")) !== "true") flipped.push(`${t}:${before?.toFixed(2)}->${after?.toFixed(2)}`);
}
check("flip layout moves the photo to the opposite side in every header template", flipped.length === 0, flipped.join(" "));
const SIDEBAR = ["aurora", "prism", "swiss", "velo"];
const sideBad = [];
for (const t of SIDEBAR) {
  await pickTemplate(t);
  const flipBox = page.getByRole("checkbox", { name: /Flip layout/ });
  if (await flipBox.isChecked()) { await flipBox.uncheck(); await page.waitForTimeout(250); }
  const before = await centreX(".doc__side");
  await page.getByRole("checkbox", { name: /Flip layout/ }).check();
  await page.waitForTimeout(250);
  const after = await centreX(".doc__side");
  const offenders = await page.evaluate(() => { const d = document.querySelector(".stage__sizer > .doc"); const r = d.getBoundingClientRect(); return [...d.querySelectorAll("*")].filter((e) => getComputedStyle(e).position !== "absolute" && getComputedStyle(e).display !== "contents" && (e.getBoundingClientRect().right > r.right + 2 || e.getBoundingClientRect().left < r.left - 2)).map((e) => `${e.tagName}.${e.className}`); });
  if (!((before - 0.5) * (after - 0.5) < 0) || offenders.length) sideBad.push(`${t}:${before?.toFixed(2)}->${after?.toFixed(2)} overflow=${offenders.slice(0, 3).join(",")}`);
}
check("flip layout moves the sidebar to the opposite side in every two-column template, without overflow", sideBad.length === 0, sideBad.join(" "));
const readable = await page.evaluate(() => { const d = document.querySelector(".stage__sizer > .doc"); return d.innerText.includes("Interaction design") && d.innerText.includes("Senior Designer"); });
check("flipped content is complete and in the same reading order", readable && (await page.evaluate(() => { const t = document.querySelector(".stage__sizer > .doc").innerText; return t.indexOf("Senior Designer") < t.indexOf("Interaction design"); })));
await pickTemplate("bloom");
check("a template that cannot be flipped says so and disables the option", (await page.getByRole("checkbox", { name: /Flip layout/ }).isDisabled()) && /fixed place/.test(await page.locator(".design__flip").first().innerText()));
await pickTemplate("summit");
await page.getByRole("checkbox", { name: /Flip layout/ }).check();
await page.waitForTimeout(200);
await page.getByRole("checkbox", { name: /Flip layout/ }).uncheck();
await page.waitForTimeout(200);
check("flip can be turned off again", (await docAttr("data-mirror")) === "false");

// ---------- reset button clears everything new ----------
await page.getByLabel("Text colour", { exact: true }).fill("#336699");
await page.getByRole("checkbox", { name: /Flip layout/ }).check();
await page.getByRole("button", { name: "Reset to template defaults" }).click();
await page.waitForTimeout(300);
check("Reset to template defaults clears colours and flip", (await docVar("--ink")) === "" && (await docAttr("data-mirror")) === "false");

// ---------- cover letters ----------
id = await newDoc("letter", "summit");
await openDoc("letter", id);
await page.getByLabel("Text colour", { exact: true }).waitFor();
check("letters get the same controls plus a date-side option", (await page.getByLabel("Text colour", { exact: true }).count()) === 1 && (await page.getByRole("checkbox", { name: /Date on the right/ }).count()) === 1);
check("letter design hides section-divider (no sections) but keeps the rest", (await page.locator(".design").getByText("Section divider").count()) === 0);
await page.getByRole("checkbox", { name: /Date on the right/ }).check();
await page.waitForTimeout(250);
check("the letter date aligns to the right", (await css(".doc__date", "textAlign")) === "right");
const lb = await centreX(".doc__photo");
await page.getByRole("checkbox", { name: /Flip layout/ }).check();
await page.waitForTimeout(250);
const la = await centreX(".doc__photo");
check("a letter's photo flips side too", (lb - 0.5) * (la - 0.5) < 0, `${lb?.toFixed(2)}->${la?.toFixed(2)}`);
await page.getByLabel("Text colour", { exact: true }).fill("#114477");
await page.waitForTimeout(250);
check("letter text colour applies to the letter body", (await css(".doc__para", "color")) === "rgb(17, 68, 119)");
await pickTemplate("aurora");
check("a sidebar template says a letter has nothing to flip", (await page.getByRole("checkbox", { name: /Flip layout/ }).isDisabled()) && /single column/.test(await page.locator(".design__flip").first().innerText()));

// ---------- real PDFs ----------
const pdfOf = async (name, doc, opts = {}) => {
  await page.evaluate(async ({ doc }) => { window.__doc = doc; }, { doc });
  await page.evaluate(async (opts) => { window.__prep = (await import("/js/export/print.js")).preparePrint(window.__doc, opts); }, opts);
  const file = `${outDir}/${name}.pdf`;
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
  await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());
  return file;
};
const sample = (kind, templateId, design = {}) =>
  page.evaluate(async ({ kind, templateId, design }) => {
    const { applyTemplate } = await import("/js/templates/design.js");
    const m = kind === "letter" ? await import("/js/models/cover-letter.js") : await import("/js/models/resume.js");
    const d = kind === "letter" ? m.createLetterSample() : m.createSample();
    applyTemplate(d, templateId);
    d.designSettings = { ...d.designSettings, showPhoto: true, ...design };
    return d;
  }, { kind, templateId, design });
const pixels = async (pdf, test) => {
  run("pdftoppm", ["-r", "60", "-f", "1", "-l", "1", "-png", pdf, `${pdf}.px`]);
  return page.evaluate(async ({ b64, test }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const tests = {
      blue: (r, g, b) => b > 140 && r < 90 && g < 90,
      yellow: (r, g, b) => r > 200 && g > 170 && b < 120,
      dark: (r, g, b) => r < 90 && g < 90 && b < 90,
    };
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (tests[test](d[i], d[i + 1], d[i + 2])) n++;
    return n;
  }, { b64: readFileSync(`${pdf}.px-1.png`).toString("base64"), test });
};
let doc = await sample("resume", "summit", { textColor: "#0000cc" });
let f = await pdfOf("p51-summit-blue", doc);
const blue = await pixels(f, "blue");
check("a custom text colour prints in that colour on a light template", blue > 300, `${blue} blue pixels`);
doc = await sample("resume", "slate", { textColor: "#ffcc00", mutedColor: "#ffee88" });
f = await pdfOf("p51-slate-yellow", doc);
const yellow = await pixels(f, "yellow");
const dark = await pixels(f, "dark");
check("a dark-on-screen template prints dark text on white and ignores light screen colours", yellow < 30 && dark > 300, `${yellow} yellow, ${dark} dark`);
const words = (pdf) => {
  const xml = run("pdftotext", ["-bbox", "-f", "1", "-l", "1", pdf, "-"]);
  const w = [...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({ x0: +m[1], y0: +m[2], text: m[5] }));
  return w;
};
const nameX = (pdf) => words(pdf).find((w) => w.text === "Alex").x0;
const plain = await pdfOf("p51-summit-plain", await sample("resume", "summit"));
const flip = await pdfOf("p51-summit-flip", await sample("resume", "summit", { mirror: true }));
check("a flipped header prints flipped: the photo moves left and pushes the name right", nameX(flip) > nameX(plain) + 30, `${nameX(plain).toFixed(0)} -> ${nameX(flip).toFixed(0)}`);
const tFlip = run("pdftotext", ["-layout", flip, "-"]).replace(/\s+/g, " ");
check("flipped output still has all text, one page, A4", tFlip.includes("Senior Designer (sample)") && /Pages:\s+1\b/.test(run("pdfinfo", [flip])));
const sideFlip = await pdfOf("p51-aurora-flip", await sample("resume", "aurora", { mirror: true }));
const sideText = run("pdftotext", ["-raw", sideFlip, "-"]).toLowerCase();
check("a flipped sidebar template still prints as one complete column on white", sideText.includes("work experience") && sideText.indexOf("skills") > sideText.indexOf("work experience") && (await pixels(sideFlip, "dark")) < 20000);
const rightDate = await pdfOf("p51-letter-date", await sample("letter", "summit", { dateAlign: "right" }));
const dw = words(rightDate).find((w) => w.text === "2026");
check("a right-aligned letter date prints at the right margin", dw && dw.x0 > 400, dw ? `x=${dw.x0.toFixed(0)}` : "not found");
const faded = await pdfOf("p51-horizon-faded", await sample("resume", "horizon", { fillOpacity: 0.2 }));
check("transparency settings never break printing", /Pages:\s+1\b/.test(run("pdfinfo", [faded])) && run("pdftotext", ["-layout", faded, "-"]).includes("Alex Sample"));

// ---------- mobile ----------
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  id = await newDoc("resume", "nexus");
  await page.goto(`${base}/#/resume/${id}`);
  await page.waitForSelector(".studio");
  await page.locator('.studio__view input[value="design"]').check({ force: true });
  await page.getByLabel("Text colour", { exact: true }).waitFor();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const tap = await page.evaluate(() => [...document.querySelectorAll(".design .colour__input, .design .range")].every((e) => e.getBoundingClientRect().height >= 24));
  check(`no horizontal overflow in the design panel @${w}, controls are tappable`, over <= 1 && tap, `overflow ${over}`);
}
await page.setViewportSize({ width: 1440, height: 1000 });
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
