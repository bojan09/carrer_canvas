// Phase 1 browser checks: console errors, offline reload, external requests, screenshots.
// Usage: NODE_PATH=<dir with playwright> node e2e/phase1.mjs [baseUrl] [outDir]
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "allow" });
const page = await context.newPage();

const errors = [];
const external = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
page.on("request", (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) external.push(r.url());
});

await page.goto(base);
await page.waitForSelector("h1");
check("home renders hero heading", (await page.textContent("h1")).includes("makes your work stand out"));

// Service worker activates and controls the page
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
check("service worker controls page after reload", true);

const cacheKeys = await page.evaluate(() => caches.keys());
check("versioned shell cache exists", cacheKeys.some((k) => k.startsWith("careercanvas-shell-")), cacheKeys.join(","));

// Offline reload + client-side navigation
await context.setOffline(true);
await page.reload();
await page.waitForSelector("h1");
check("offline reload renders app shell", (await page.textContent("h1")).includes("makes your work stand out"));
await page.goto(base + "/#/templates");
await page.waitForSelector(".template-card");
check("offline route /templates renders 10 cards", (await page.locator(".template-card").count()) === 10);
check("offline pill visible", await page.locator("#net-status").isVisible());
await page.goto(base + "/#/settings");
await page.waitForSelector("#kv-offline");
check("settings reports offline support ready", (await page.textContent("#kv-offline")).startsWith("Ready"));
await context.setOffline(false);

// Theme persistence
await page.goto(base + "/#/settings");
await page.check('input[name="theme"][value="light"]');
await page.reload();
check("light theme persists across reload", (await page.getAttribute("html", "data-theme")) === "light");
await page.check('input[name="theme"][value="dark"]');

// Template filtering
await page.goto(base + "/#/templates");
await page.click('[data-cat="Tech"]');
check("Tech filter shows 2 templates", (await page.locator(".template-card").count()) === 2);

// Manifest sanity
const manifest = await page.evaluate(() => fetch("manifest.webmanifest").then((r) => r.json()));
check("manifest has standalone display + maskable icon", manifest.display === "standalone" && manifest.icons.some((i) => i.purpose === "maskable"));

// Screenshots at key widths
for (const [w, h] of [[320, 700], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const route of ["", "templates", "settings", "resume"]) {
    await page.goto(`${base}/#/${route}`);
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) check(`no horizontal overflow ${route || "home"} @${w}`, false);
    await page.screenshot({ path: `${out}/${route || "home"}-${w}.png`, fullPage: route === "" });
  }
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(base + "/#/");
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/home-light-1440.png`, fullPage: true });

check("no console errors", errors.length === 0, errors.join(" | "));
check("no external network requests", external.length === 0, external.join(","));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
