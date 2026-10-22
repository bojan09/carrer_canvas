// Generates PNG icons, iOS splash screens and manifest screenshots with Playwright/Chromium.
// Usage: NODE_PATH=<dir containing playwright> node scripts/generate-assets.mjs
// Re-run only when branding changes; outputs are committed.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const p = (...a) => resolve(root, ...a);

const logoSvg = await readFile(p("assets/icons/favicon.svg"), "utf8");
const glyph = logoSvg.replace(/<rect width="64" height="64"[^>]*\/>/, "").replace(/<\/?svg[^>]*>/g, "").replace(/<defs>[\s\S]*<\/defs>/, "");
const defs = logoSvg.match(/<defs>[\s\S]*<\/defs>/)[0];

// Full-bleed square (maskable / apple-touch): glyph scaled into the safe zone
const bleed = (size, scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${defs}
  <rect width="64" height="64" fill="url(#g)"/><g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${glyph}</g></svg>`;
const rounded = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${logoSvg.replace(/<\/?svg[^>]*>/g, "")}</svg>`;

const IOS_SPLASH = [
  [1290, 2796, 3], [1179, 2556, 3], [1284, 2778, 3], [1170, 2532, 3], [1125, 2436, 3], [1080, 2340, 3],
  [828, 1792, 2], [750, 1334, 2], [2048, 2732, 2], [1668, 2388, 2], [1640, 2360, 2], [1620, 2160, 2],
];

const browser = await chromium.launch();
const render = async (html, w, h, out, { transparent = false } = {}) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:${transparent ? "transparent" : "#091226"}}svg{display:block}</style>${html}`);
  await page.screenshot({ path: p(out), omitBackground: transparent });
  await page.close();
};

await render(rounded(192), 192, 192, "assets/icons/icon-192.png", { transparent: true });
await render(rounded(512), 512, 512, "assets/icons/icon-512.png", { transparent: true });
await render(rounded(32), 32, 32, "assets/icons/favicon-32.png", { transparent: true });
await render(bleed(192, 0.7), 192, 192, "assets/icons/icon-maskable-192.png");
await render(bleed(512, 0.7), 512, 512, "assets/icons/icon-maskable-512.png");
await render(bleed(180, 0.8), 180, 180, "assets/icons/apple-touch-icon.png");

const links = [];
for (const [w, h, dpr] of IOS_SPLASH) {
  const name = `assets/splash/splash-${w}x${h}.png`;
  const mark = Math.round(w * 0.22);
  const html = `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;align-content:center;gap:${Math.round(w * 0.04)}px;
    background:radial-gradient(60% 40% at 85% 5%,rgba(151,71,255,.4),transparent 60%),radial-gradient(60% 40% at 10% 95%,rgba(83,107,255,.35),transparent 60%),#091226;
    color:#f1f4ff;font-family:system-ui,sans-serif">
    <div style="width:${mark}px;height:${mark}px">${rounded(mark)}</div>
    <div style="font-size:${Math.round(w * 0.06)}px;font-weight:800;letter-spacing:-.02em">CareerCanvas</div></div>`;
  await render(html, w, h, name);
  links.push(`    <link rel="apple-touch-startup-image" media="(device-width: ${w / dpr}px) and (device-height: ${h / dpr}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" href="${name}" />`);
}
await browser.close();

// Inject splash links into index.html between markers (idempotent)
let html = await readFile(p("index.html"), "utf8");
html = html.replace(/<!--SPLASH-->[\s\S]*<!--\/SPLASH-->/, `<!--SPLASH-->\n${links.join("\n")}\n    <!--/SPLASH-->`);
await writeFile(p("index.html"), html);
console.log(`Generated icons, ${IOS_SPLASH.length} splash images and updated index.html`);
