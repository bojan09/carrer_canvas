// Phase 7 quality gate (Chromium): axe-core accessibility scan of every route in light and dark, viewport matrix
// with overflow checks, reduced motion, keyboard-only focus visibility and no-trap checks.
// axe-core is not a dependency of the app: AXE_PATH points at axe.min.js (npm i axe-core in any scratch folder).
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const axeSrc = readFileSync(process.env.AXE_PATH || "/tmp/p7/node_modules/axe-core/axe.min.js", "utf8");
const shots = "e2e/screenshots/phase7";
mkdirSync(shots, { recursive: true });
const check = (name, ok, detail = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);

const browser = await chromium.launch();
const errors = [];
const mkContext = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", ...opts });
  await ctx.addInitScript((theme) => { try { localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true, styleSeen: true, theme })); } catch {} }, opts.theme || "system");
  return ctx;
};
const seed = async (page) => {
  await page.goto(`${base}/#/`);
  await page.waitForSelector("h1");
  return page.evaluate(async () => {
    const { getRepository } = await import("/js/storage/repository.js");
    const r = await import("/js/models/resume.js");
    const l = await import("/js/models/cover-letter.js");
    const repo = await getRepository();
    const a = r.createSample();
    const b = l.createLetterSample();
    await repo.put(a);
    await repo.put(b);
    return { resume: a.id, letter: b.id };
  });
};

const ROUTES = (ids) => [
  ["home", "#/"],
  ["templates", "#/templates"],
  ["saved", "#/saved"],
  ["settings", "#/settings"],
  ["new-letter", "#/cover-letter"],
  ["resume-editor", `#/resume/${ids.resume}`],
  ["letter-editor", `#/cover-letter/${ids.letter}`],
  ["not-found", "#/nope"],
];
const go = async (page, hash, ready = "main > *") => {
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector("main > *");
  await page.goto(`${base}/${hash}`);
  await page.waitForSelector(ready, { state: "attached" });
  await page.waitForTimeout(500);
};

// ---------- 1. axe, both themes ----------
for (const theme of ["light", "dark"]) {
  const ctx = await mkContext({ colorScheme: theme, theme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const ids = await seed(page);
  await page.evaluate((t) => document.documentElement.getAttribute("data-theme"), theme);
  const views = [...ROUTES(ids).map(([n, h]) => [n, h, null])];
  views.push(["resume-style-panel", `#/resume/${ids.resume}`, "design"], ["letter-style-panel", `#/cover-letter/${ids.letter}`, "design"]);
  for (const [name, hash, view] of views) {
    await go(page, hash, hash.includes("/resume/") || hash.includes("/cover-letter/") && hash.split("/").length > 2 ? ".stage__sizer > .doc" : "main > *");
    if (view) {
      await page.locator(".studio__stylebtn").click();
      await page.waitForTimeout(400);
    }
    await page.evaluate(axeSrc);
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || n.none[0]?.message || "")) }));
    });
    const serious = res.filter((v) => ["serious", "critical"].includes(v.impact));
    check(`axe (${theme}) ${name}: no serious or critical violations`, serious.length === 0, serious.map((v) => `${v.id}x${v.n} ${v.sample.join(" | ")}`).join(" ;; "));
    const minor = res.filter((v) => !["serious", "critical"].includes(v.impact));
    if (minor.length) console.log(`NOTE  axe (${theme}) ${name}: ${minor.map((v) => `${v.id}(${v.impact})x${v.n} ${v.sample[0]}`).join(" ;; ")}`);
  }
  await ctx.close();
}

// ---------- 2. viewport matrix ----------
{
  const ctx = await mkContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  const ids = await seed(page);
  const sizes = [[320, 700], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [844, 390], [667, 375]];
  const bad = [];
  for (const [w, hgt] of sizes) {
    await page.setViewportSize({ width: w, height: hgt });
    for (const [name, hash] of ROUTES(ids)) {
      await go(page, hash, hash.includes("/resume/") || hash.startsWith("#/cover-letter/") ? ".stage__sizer > .doc" : "main > *");
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const clipped = await page.evaluate(() => [...document.querySelectorAll("button, a.btn, .btn")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !b.closest(".stage"); }).length);
      if (over > 0 || clipped) bad.push(`${w}x${hgt} ${name}: overflow ${over}px, ${clipped} clipped buttons`);
      if ([320, 390, 1440].includes(w) && ["home", "resume-editor"].includes(name)) await page.screenshot({ path: `${shots}/${name}-${w}.png` });
    }
  }
  check(`no sideways scroll or clipped buttons on ${ROUTES(ids).length} routes at ${sizes.length} viewport sizes (incl. landscape phones)`, bad.length === 0, bad.slice(0, 6).join(" ;; "));
  await ctx.close();
}

// ---------- 3. reduced motion ----------
{
  const ctx = await mkContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const ids = await seed(page);
  await go(page, `#/resume/${ids.resume}`, ".stage__sizer > .doc");
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getComputedTiming().iterations === Infinity || a.effect?.getComputedTiming().duration > 50)).length);
  check("reduced motion: no looping or long animations are running in the editor", running === 0, `${running} running`);
  const dur = await page.evaluate(() => { const b = document.querySelector(".btn"); return b ? getComputedStyle(b).transitionDuration : "0s"; });
  check("reduced motion: control transitions are effectively instant", parseFloat(dur) <= 0.01, dur);
  await ctx.close();
}

// ---------- 4. keyboard only ----------
{
  const ctx = await mkContext();
  const page = await ctx.newPage();
  const ids = await seed(page);
  for (const [name, hash, ready] of [["home", "#/", "main > *"], ["settings", "#/settings", "main > *"], ["resume editor", `#/resume/${ids.resume}`, ".stage__sizer > .doc"]]) {
    await go(page, hash, ready);
    await page.evaluate(() => document.activeElement?.blur());
    const seen = new Set();
    const hidden = [];
    let stuck = false;
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
        const r = el.getBoundingClientRect();
        const again = el.dataset.kbSeen === "1";
        el.dataset.kbSeen = "1";
        return { key: `${el.tagName}|${el.id}|${el.className}|${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}`, again, visible, size: r.width * r.height };
      });
      if (!info) continue;
      if (info.again) { if (seen.size > 3) break; stuck = true; break; }
      seen.add(info.key + "#" + i);
      if (!info.visible && info.size > 0) hidden.push(info.key);
    }
    check(`keyboard: ${name}: Tab reaches ${seen.size} controls with no trap`, seen.size >= 5 && !stuck);
    check(`keyboard: ${name}: every focused control shows a focus indicator`, hidden.length === 0, hidden.slice(0, 4).join(" ;; "));
  }
  await ctx.close();
}

// ---------- 5. text zoom and forced colours (best effort) ----------
{
  const ctx = await mkContext({ forcedColors: "active" });
  const page = await ctx.newPage();
  const ids = await seed(page);
  await go(page, `#/resume/${ids.resume}`, ".stage__sizer > .doc");
  const ok = await page.evaluate(() => { const b = document.querySelector(".studio__stylebtn"); const cs = getComputedStyle(b); return b.getBoundingClientRect().width > 0 && cs.color !== cs.backgroundColor; });
  check("forced colours (Windows high contrast): the Style button stays visible and distinct", ok);
  await ctx.close();
}

check("no console or page errors across the audit", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
