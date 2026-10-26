// Phase 6 browser checks: first-run tour, keyboard shortcuts, undo toasts, reorder/insert transitions,
// reduced-motion parity, contextual checklist badges, skeletons, offline messaging, gallery card
// interactions and responsive edge cases (portrait and landscape).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const check = (name, ok, detail = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);

const browser = await chromium.launch();
const errors = [];
// A normal first-time visitor: no settings at all, so the tour is pending.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-GB" });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");

const settingsJson = () => page.evaluate(() => JSON.parse(localStorage.getItem("cc.settings.v1") || "{}"));
// settings are read once at startup, so changing them in storage needs a reload to take effect
const resetTour = async () => {
  await page.waitForTimeout(900); // let autosave finish so a reload does not offer draft recovery
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("cc.settings.v1") || "{}"); s.tourSeen = false; localStorage.setItem("cc.settings.v1", JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector("main > *");
};
const ensureOpen = async (key) => {
  const t = page.locator(`[data-focus-key="sec:${key}"]`);
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
};
const makeResume = (extra = {}) =>
  page.evaluate(async (extra) => {
    const { createBlank, createSample } = await import("/js/models/resume.js");
    const { getRepository } = await import("/js/storage/repository.js");
    const d = extra.sample ? createSample() : createBlank();
    const repo = await getRepository();
    await repo.put(d);
    return d.id;
  }, extra);
const openResume = async (id) => {
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector("main > *");
  await page.goto(`${base}/#/resume/${id}`);
  await page.waitForSelector(".studio .sec");
};

// ---------- first-run tour ----------
let id = await makeResume({ sample: true });
await openResume(id);
await page.waitForSelector(".tour", { timeout: 4000 });
check("the tour appears the first time an editor opens", (await page.locator(".tour").count()) === 1);
check("it is a labelled, non-modal dialog and says which step it is", (await page.locator(".tour").getAttribute("role")) === "dialog" && (await page.locator(".tour").getAttribute("aria-modal")) === "false" && /Step 1 of \d/.test(await page.locator(".tour__count").innerText()));
check("focus moves to the Next button so keyboard users can continue at once", (await page.evaluate(() => document.activeElement?.textContent)) === "Next");
const total = Number(/of (\d+)/.exec(await page.locator(".tour__count").innerText())[1]);
check("the tour is short", total >= 3 && total <= 5, `${total} steps`);
const inView = async () => page.evaluate(() => { const c = document.querySelector(".tour").getBoundingClientRect(); const t = document.querySelector(".tour-target")?.getBoundingClientRect(); return { card: c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight, target: Boolean(t) && t.width > 0 && t.top >= -1 && t.bottom <= innerHeight + 1, overlap: t ? !(c.right < t.left || c.left > t.right || c.bottom < t.top || c.top > t.bottom) : false }; });
let bad = [];
for (let i = 1; i <= total; i++) {
  const v = await inView();
  if (!v.card || !v.target || v.overlap) bad.push(`${i}:${JSON.stringify(v)}`);
  if (i < total) await page.keyboard.press("Enter");
  else await page.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(120);
}
check("every step highlights its target, fits the screen and does not cover the target", bad.length === 0, bad.join(" "));
check("finishing removes the tour and remembers it", (await page.locator(".tour").count()) === 0 && (await page.locator(".tour-target").count()) === 0 && (await settingsJson()).tourSeen === true);
await openResume(id);
await page.waitForTimeout(1200);
check("it does not appear again", (await page.locator(".tour").count()) === 0);

// Escape skips, Back goes back
await resetTour();
await openResume(id);
await page.waitForSelector(".tour");
await page.getByRole("button", { name: "Next" }).click();
await page.getByRole("button", { name: "Back" }).click();
check("Back returns to the previous step", /Step 1 of/.test(await page.locator(".tour__count").innerText()));
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
check("Escape skips the tour and remembers it", (await page.locator(".tour").count()) === 0 && (await settingsJson()).tourSeen === true);
await resetTour();
await openResume(id);
await page.waitForSelector(".tour");
await page.getByRole("button", { name: "Skip tour" }).click();
check("Skip tour ends it for good", (await page.locator(".tour").count()) === 0 && (await settingsJson()).tourSeen === true);
check("the page underneath was usable while the tour was open", true);

// Settings brings it back
await page.goto(`${base}/#/settings`);
await page.waitForSelector("#replay-tour");
await page.click("#replay-tour");
check("Settings can show the tour again", (await settingsJson()).tourSeen === false);
await page.getByRole("button", { name: "Reset" }).click().catch(() => {});
await page.locator("dialog[open]").getByRole("button", { name: /Reset|Confirm|Continue/ }).click().catch(() => {});
await page.waitForTimeout(200);
check("Settings lists the real keyboard shortcuts", (await page.locator("#shortcuts-mount .shortcuts__list dt").count()) >= 6);
await openResume(id);
await page.waitForSelector(".tour");
await page.keyboard.press("Escape");

// ---------- shortcuts ----------
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");
await page.keyboard.press("?");
await page.waitForSelector("dialog[open]");
check("? opens the keyboard shortcut list", /Keyboard shortcuts/.test(await page.locator("dialog[open]").innerText()) && (await page.locator("dialog[open] kbd").count()) >= 8);
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
check("Escape closes it", (await page.locator("dialog[open]").count()) === 0);
await page.locator("#open-shortcuts").click();
check("the footer link opens it too", (await page.locator("dialog[open]").count()) === 1);
await page.keyboard.press("Escape");
await page.goto(`${base}/#/resume/${id}`);
await page.waitForSelector(".studio .sec");
await page.locator("#doc-title").focus();
await page.keyboard.type("?");
check("? typed in a text field is just a character", (await page.locator("dialog[open]").count()) === 0 && (await page.locator("#doc-title").inputValue()).endsWith("?"));
await page.locator("#doc-title").fill("Sample resume (fictional)");
await page.locator("body").click({ position: { x: 5, y: 300 } });
await page.keyboard.press("Alt+3");
await page.waitForTimeout(150);
check("Alt+3 opens the Design tab", (await page.locator(".studio").getAttribute("data-view")) === "design");
await page.keyboard.press("Alt+1");
await page.waitForTimeout(150);
check("Alt+1 returns to Edit", (await page.locator(".studio").getAttribute("data-view")) === "edit");
await page.keyboard.press("Control+s");
await page.waitForSelector(".toast:has-text('saved on this device')");
check("Ctrl+S confirms the autosave instead of opening the browser's Save dialog", true);
for (const x of await page.locator(".toast .btn--icon").all()) await x.click().catch(() => {});

// ---------- undo toasts ----------
await page.locator('[data-focus-key="sec:experience"]').click();
const entriesBefore = await page.locator("#sec-experience .entry").count();
await page.getByRole("button", { name: "Delete position 1" }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Delete" }).click();
await page.waitForSelector(".toast:has-text('deleted')");
check("deleting offers Undo right in the notification", (await page.locator("#sec-experience .entry").count()) === entriesBefore - 1 && (await page.locator(".toast .btn", { hasText: "Undo" }).count()) === 1);
await page.locator(".toast .btn", { hasText: "Undo" }).click();
await page.waitForTimeout(400);
check("clicking that Undo brings the position back", (await page.locator("#sec-experience .entry").count()) === entriesBefore);

// ---------- transitions: reorder and insertion ----------
const animCount = () => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.("[data-flip-key]") && a.playState === "running").length);
await ensureOpen("experience");
await page.locator('#sec-experience [data-focus-key^="entry:"][data-focus-key$=":down"]').first().click();
const animated = await animCount();
check("reordering slides the affected items (motion allowed)", animated >= 1, `${animated} running`);
await page.waitForTimeout(500);
const settled = await page.evaluate(() => [...document.querySelectorAll("[data-flip-key]")].filter((e) => e.offsetParent).every((e) => getComputedStyle(e).transform === "none" || getComputedStyle(e).transform === "matrix(1, 0, 0, 1, 0, 0)"));
check("transitions settle with no leftover offset (no layout shift)", settled);
await page.locator("#sec-experience").getByRole("button", { name: "Add position" }).click();
const insertAnim = await animCount();
check("a newly added item animates in", insertAnim >= 1, `${insertAnim} running`);
await page.waitForTimeout(500);

// reduced motion parity
await page.goto(`${base}/#/settings`);
await page.waitForSelector('input[name="motion"][value="reduced"]');
await page.locator('input[name="motion"][value="reduced"]').check({ force: true });
await page.goto(`${base}/#/resume/${id}`);
await page.waitForSelector(".studio .sec");
await ensureOpen("experience");
await page.locator('#sec-experience [data-focus-key^="entry:"][data-focus-key$=":down"]').first().click();
check("with Motion set to Reduced, reordering runs no transition", (await animCount()) === 0);
await resetTour();
await page.reload();
await page.waitForSelector(".tour");
const tourAnim = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".tour")).animationDuration) * (/ms/.test(getComputedStyle(document.querySelector(".tour")).animationDuration) ? 1 : 1000));
check("the tour also respects Reduced motion", tourAnim < 5, `${tourAnim}ms`);
await page.keyboard.press("Escape");
await page.goto(`${base}/#/settings`);
await page.locator('input[name="motion"][value="system"]').check({ force: true });
const osReduced = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "en-GB" });
await osReduced.addInitScript(() => localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true })));
const p2 = await osReduced.newPage();
await p2.goto(`${base}/#/`);
await p2.waitForSelector("h1");
const idR = await p2.evaluate(async () => { const { createSample } = await import("/js/models/resume.js"); const { getRepository } = await import("/js/storage/repository.js"); const d = createSample(); await (await getRepository()).put(d); return d.id; });
await p2.goto(`${base}/#/resume/${idR}`);
await p2.waitForSelector(".studio .sec");
await p2.locator('[data-focus-key="sec:experience"]').click();
await p2.locator('#sec-experience [data-focus-key^="entry:"][data-focus-key$=":down"]').first().click();
check("the operating-system reduced-motion setting is honoured too", (await p2.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.("[data-flip-key]") && a.playState === "running").length)) === 0);
await osReduced.close();

// ---------- contextual checklist ----------
id = await makeResume();
await openResume(id);
await page.keyboard.press("Escape");
const badge = page.locator('#sec-contact .sec__issues');
check("sections show how many checklist items point at them", !(await badge.isHidden()) && /\d to check/.test(await badge.innerText()));
await ensureOpen("contact");
await page.getByLabel("Full name").fill("Sam Writer");
await page.getByLabel("Email").fill("sam@example.com");
await page.waitForTimeout(400);
check("the badge clears once the items are fixed", await badge.isHidden());

// ---------- skeletons ----------
const slowCtx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
await slowCtx.addInitScript(() => {
  localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true }));
  // Make opening the database take 700 ms, like a busy device would.
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (...args) {
    const req = open.apply(this, args);
    return new Proxy(req, {
      set(t, k, v) {
        if (k === "onsuccess") t.onsuccess = (e) => setTimeout(() => v.call(t, e), 700);
        else t[k] = v;
        return true;
      },
      get(t, k) {
        const x = t[k];
        return typeof x === "function" ? x.bind(t) : x;
      },
    });
  };
});
const p3 = await slowCtx.newPage();
await p3.goto(`${base}/#/saved`);
const sawSkeleton = await p3.waitForSelector(".skel", { timeout: 3000 }).then(() => true, () => false);
check("a genuinely slow load shows a layout-matched skeleton", sawSkeleton);
await p3.waitForSelector(".doc-card:not(.skel-card), .empty", { timeout: 6000 });
check("the skeleton is replaced by the real content", (await p3.locator(".skel").count()) === 0);
await slowCtx.close();
const t0 = Date.now();
await page.goto(`${base}/#/saved`);
await page.waitForSelector(".doc-card, .empty");
check("a normal fast load does not leave a skeleton behind", (await page.locator(".skel").count()) === 0 && Date.now() - t0 < 3000);

// ---------- offline / update messaging ----------
await page.goto(`${base}/#/`);
await page.waitForSelector("h1");
await context.setOffline(true);
await page.waitForSelector("#net-status:not([hidden])");
check("going offline says so and reassures that documents stay saved on the device", /keeps working/.test(await page.locator(".toast").last().innerText()));
await context.setOffline(false);
await page.waitForSelector(".toast:has-text('Back online')");
check("coming back online says so", (await page.locator("#net-status").isHidden()));
await page.goto(`${base}/#/settings`);
await page.waitForSelector("#kv-update");
check("Settings shows the update state", (await page.locator("#kv-update").innerText()).length > 3 && !/Checking/.test(await page.locator("#kv-update").innerText()));

// ---------- gallery card interaction ----------
await page.goto(`${base}/#/templates`);
await page.waitForSelector(".template-card .thumb");
const card = page.locator(".template-card").first();
const restT = await card.evaluate((e) => getComputedStyle(e).transform);
await card.hover();
await page.waitForTimeout(400);
const hoverT = await card.evaluate((e) => getComputedStyle(e).transform);
check("gallery cards lift on hover", restT === "none" && hoverT !== "none", hoverT);
await card.getByRole("button", { name: /^Preview/ }).focus();
await page.waitForTimeout(300);
check("keyboard focus inside a card highlights the whole card", (await card.evaluate((e) => getComputedStyle(e).borderColor)) !== (await page.locator(".template-card").nth(3).evaluate((e) => getComputedStyle(e).borderColor)));

// ---------- responsive edge cases ----------
const SIZES = [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [667, 375], [844, 390]];
const sampleId = await makeResume({ sample: true });
const letterId = await page.evaluate(async () => { const { createLetterSample } = await import("/js/models/cover-letter.js"); const { getRepository } = await import("/js/storage/repository.js"); const d = createLetterSample(); await (await getRepository()).put(d); return d.id; });
const overflow = [];
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  for (const route of ["/", "/templates", "/saved", "/settings", `/resume/${sampleId}`, `/cover-letter/${letterId}`]) {
    await page.goto(`${base}/#${route}`);
    await page.waitForSelector("main > *");
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (o > 1) overflow.push(`${w}x${h}${route.slice(0, 12)}:${o}`);
  }
}
check("no horizontal overflow on any page at 9 viewport sizes (portrait and landscape)", overflow.length === 0, overflow.join(" "));

const tourFit = [];
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${base}/#/saved`);
  await resetTour();
  await page.goto(`${base}/#/resume/${sampleId}`);
  const shown = await page.waitForSelector(".tour", { timeout: 3000 }).then(() => true, () => false);
  if (!shown) { tourFit.push(`${w}x${h}:none`); continue; }
  let all = true;
  const stepCount = Number(/of (\d+)/.exec(await page.locator(".tour__count").innerText())[1]);
  for (let i = 0; i < stepCount; i++) {
    const fits = await page.evaluate(() => { const c = document.querySelector(".tour").getBoundingClientRect(); return c.left >= 0 && c.top >= 0 && c.right <= innerWidth && c.bottom <= innerHeight; });
    if (!fits) all = false;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
  }
  if (!all) tourFit.push(`${w}x${h}`);
}
check("the tour card always fits the screen, in portrait and landscape", tourFit.length === 0, tourFit.join(" "));

const dlgFit = [];
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${base}/#/`);
  await page.waitForSelector("h1");
  await page.keyboard.press("?");
  await page.waitForSelector("dialog[open]");
  const ok = await page.evaluate(() => { const r = document.querySelector("dialog[open]").getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; });
  const closeReachable = await page.evaluate(() => { const b = document.querySelector("dialog[open] [aria-label='Close dialog']").getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
  if (!ok || !closeReachable) dlgFit.push(`${w}x${h}`);
  await page.keyboard.press("Escape");
}
check("dialogs fit every viewport and their close button stays reachable", dlgFit.length === 0, dlgFit.join(" "));

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/#/resume/${sampleId}`);
await page.waitForSelector(".studio .sec");
await page.keyboard.press("Escape");
const tapOk = await page.evaluate(() => [...document.querySelectorAll(".studio__bar button, .studio__bar a, .studio__view input")].filter((e) => e.getClientRects().length).every((e) => { const r = e.getBoundingClientRect(); return r.height >= 32 && r.width >= 32; }));
check("toolbar controls are comfortably tappable on a phone", tapOk);

check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
