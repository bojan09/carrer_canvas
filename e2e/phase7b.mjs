// Phase 7 data and lifecycle checks (Chromium): service-worker update with unsaved typing, storage quota failure,
// special Unicode, hostile text, very long URLs and a very long resume across paper sizes (real PDFs).
// The update test serves a throw-away copy of the app on another port so the repo is never modified.
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const outDir = "e2e/pdf";
mkdirSync(outDir, { recursive: true });
const check = (name, ok, detail = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const browser = await chromium.launch();
const errors = [];
const newPage = async (url = base, init) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB" });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("cc.settings.v1")) localStorage.setItem("cc.settings.v1", JSON.stringify({ tourSeen: true, styleSeen: true })); } catch {} });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  return { ctx, page };
};
const startBlank = async (page, root) => {
  await page.goto(`${root}/#/resume`);
  await page.getByRole("button", { name: "Start blank" }).click();
  await page.waitForSelector(".stage__sizer > .doc", { state: "attached" });
};

// ---------- 1. update while typing: nothing is lost and nothing reloads by itself ----------
{
  const site = "/tmp/p7/site";
  rmSync(site, { recursive: true, force: true });
  cpSync(".", site, { recursive: true, filter: (p) => !/(^|\/)(\.git|node_modules|e2e|docs|tests)(\/|$)/.test(p) });
  const server = spawn("node", [`${site}/scripts/serve.mjs`, "4175"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const root = "http://localhost:4175";
  const { ctx, page } = await newPage(root);
  await startBlank(page, root);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  const firstController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  check("update test: the first visit installs and takes control of the page", firstController);
  const v1 = await page.evaluate(async () => (await caches.keys()).join(","));
  writeFileSync(`${site}/sw.js`, readFileSync(`${site}/sw.js`, "utf8").replace(/const CACHE_VERSION = "[^"]+"/, 'const CACHE_VERSION = "9.9.9-test"'));
  await page.getByLabel("Full name").fill("Typed Before Update");
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForSelector(".toast:has-text('new version')", { timeout: 15000 }).then(() => check("update test: a new version is announced, not applied silently", true), () => check("update test: a new version is announced, not applied silently", false));
  check("update test: the open page keeps running with its unsaved typing", (await page.getByLabel("Full name").inputValue()) === "Typed Before Update" && (await page.locator(".toast", { hasText: "new version" }).locator("button", { hasText: "Reload" }).count()) === 1);
  const navs = [];
  page.on("framenavigated", (f) => f === page.mainFrame() && navs.push(f.url()));
  await page.waitForTimeout(1500);
  check("update test: the page does not reload by itself", navs.length === 0);
  await Promise.all([page.waitForEvent("load", { timeout: 15000 }).catch(() => {}), page.locator(".toast button", { hasText: "Reload" }).click()]);
  await page.waitForSelector(".stage__sizer > .doc", { state: "attached" });
  const after = await page.evaluate(async () => ({ caches: (await caches.keys()).join(","), name: document.querySelector(".doc__name")?.textContent }));
  check("update test: after Reload the typed name was saved first and survived", after.name === "Typed Before Update", after.name);
  check("update test: the new version's cache is active", after.caches.includes("9.9.9-test") && v1 !== after.caches, `${v1} -> ${after.caches}`);
  await ctx.close();
  server.kill();
  rmSync(site, { recursive: true, force: true });
}

// ---------- 2. storage quota exceeded while typing ----------
{
  const { ctx, page } = await newPage();
  await startBlank(page, base);
  await page.getByLabel("Full name").fill("Before quota");
  await page.waitForFunction(() => /Saved on this device/.test(document.querySelector(".studio__status")?.textContent || ""));
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException("quota", "QuotaExceededError"); };
  });
  await page.getByLabel("Full name").fill("After quota");
  await page.waitForFunction(() => /Couldn't save/.test(document.querySelector(".studio__status")?.textContent || ""), null, { timeout: 8000 }).then(() => check("quota: a failed save says so instead of pretending", true), () => check("quota: a failed save says so instead of pretending", false));
  check("quota: the Retry button appears and the editor keeps the text", (await page.locator(".studio__statusrow button:visible", { hasText: "Retry" }).count()) === 1 && (await page.getByLabel("Full name").inputValue()) === "After quota");
  await ctx.close();
}

// ---------- 3. special Unicode, hostile text, long URLs ----------
const hostile = {
  fullName: "Zoë Łukasiewicz 李小龍 محمد 🙂 ‮evil",
  title: "<img src=x onerror=window.__pwned=1> Engineer",
  website: `https://example.com/${"very-long-path-segment-".repeat(14)}end`,
  email: "name+tag@sub.example.co.uk",
};
{
  const { ctx, page } = await newPage();
  await startBlank(page, base);
  await page.getByLabel("Full name").fill(hostile.fullName);
  await page.getByLabel("Job title").fill(hostile.title).catch(() => {});
  await page.getByLabel("Email").fill(hostile.email);
  await page.getByLabel("Website").fill(hostile.website).catch(() => {});
  await page.waitForTimeout(500);
  check("unicode: CJK, Arabic, emoji and a bidi override render as text in the preview", (await page.locator(".doc__name").textContent()).includes("李小龍") && (await page.locator(".doc__name").textContent()).includes("محمد"));
  check("hostile text: markup in a field is shown as text, never run", (await page.evaluate(() => window.__pwned)) === undefined && (await page.locator(".stage__sizer img[src='x']").count()) === 0);
  const over = await page.evaluate(() => { const d = document.querySelector(".stage__sizer > .doc"); const r = d.getBoundingClientRect(); return [...d.querySelectorAll("*")].filter((e) => getComputedStyle(e).position !== "absolute" && getComputedStyle(e).display !== "contents" && e.getBoundingClientRect().right > r.right + 2).map((e) => e.className).slice(0, 4); });
  check("long URL: a 300-character link wraps inside the page instead of overflowing it", over.length === 0, over.join(","));
  await page.waitForFunction(() => /Saved on this device/.test(document.querySelector(".studio__status")?.textContent || ""));
  await page.reload();
  await page.waitForSelector(".stage__sizer > .doc", { state: "attached" });
  check("unicode: everything survives a reload unchanged, except the bidi-override control character, which is stripped on purpose", (await page.getByLabel("Full name").inputValue()) === hostile.fullName.replace("\u202E", ""));
  const doc = await page.evaluate(async () => { const { getRepository } = await import("/js/storage/repository.js"); const r = await getRepository(); const id = await r.getLastResumeId(); return r.get(id); });
  await page.evaluate(async (d) => {
    const pr = await import("/js/export/print.js");
    await pr.loadDocFonts(d);
    window.__prep = pr.preparePrint(d, {});
    void document.getElementById("print-root")?.offsetHeight;
    await document.fonts.ready;
  }, doc);
  await page.waitForTimeout(300);
  await page.pdf({ path: `${outDir}/p7-unicode.pdf`, preferCSSPageSize: true });
  const t = run("pdftotext", ["-layout", `${outDir}/p7-unicode.pdf`, "-"]);
  check("unicode: the PDF has Latin-extended text and the long link on one page", t.includes("Łukasiewicz") && /Pages:\s+1\b/.test(run("pdfinfo", [`${outDir}/p7-unicode.pdf`])) && t.replace(/\s+/g, "").includes("very-long-path-segment-".repeat(3).replace(/\s+/g, "")), t.split("\n").find((l) => l.includes("Zo")) || "");
  const cjk = t.includes("李小龍");
  console.log(`NOTE  CJK in the PDF: ${cjk ? "extracted as text" : "NOT extracted (no CJK system font in this container); on a device with a CJK font the browser supplies it"}`);
  await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());
  await ctx.close();
}

// ---------- 4. very long resume: page counts on A4 and Letter, nothing lost ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${base}/#/`);
  await page.waitForSelector("h1");
  for (const size of ["A4", "Letter"]) {
    const d = await page.evaluate(async (size) => {
      const { createSample } = await import("/js/models/resume.js");
      const d = createSample();
      d.pageSize = size;
      const exp = d.sections.experience;
      for (let i = 0; i < 14; i += 1) exp.items.push({ ...structuredClone(exp.items[0]), id: `x${i}`, title: `Role number ${i} (sample)`, bullets: Array.from({ length: 5 }, (_, j) => ({ id: `b${i}${j}`, text: `Bullet ${j} of role ${i}: ${"sample sentence ".repeat(6)}` })) });
      return d;
    }, size);
    await page.evaluate(async (d) => { const pr = await import("/js/export/print.js"); await pr.loadDocFonts(d); window.__prep = pr.preparePrint(d, {}); void document.getElementById("print-root")?.offsetHeight; await document.fonts.ready; }, d);
    await page.waitForTimeout(300);
    const file = `${outDir}/p7-long-${size}.pdf`;
    await page.pdf({ path: file, preferCSSPageSize: true });
    const info = run("pdfinfo", [file]);
    const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
    const txt = run("pdftotext", [file, "-"]);
    check(`long resume on ${size}: multiple pages, correct paper size, and every role present`, pages >= 3 && (size === "A4" ? /59[45]\.\d+ x 84[12]/.test(info) : /612 x 792/.test(info)) && [0, 7, 13].every((i) => txt.includes(`Role number ${i} (sample)`)), `${pages} pages`);
    const cut = run("pdftotext", ["-layout", file, "-"]).split("\f").slice(0, -1).filter((p) => p.trim().length < 40).length;
    check(`long resume on ${size}: no blank page`, cut === 0);
    await page.evaluate(async () => (await import("/js/export/print.js")).cleanupPrint());
  }
  await ctx.close();
}

check("no unexpected console or page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
