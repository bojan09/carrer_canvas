import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (f) => readFile(join(root, f), "utf8");
const exists = (f) => stat(join(root, f)).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(rel)));
    else out.push(rel);
  }
  return out;
}

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test("service worker version matches app and package versions", async () => {
  const sw = (await read("sw.js")).match(/CACHE_VERSION = "([^"]+)"/)[1];
  const app = (await read("js/config.js")).match(/APP_VERSION = "([^"]+)"/)[1];
  const pkg = JSON.parse(await read("package.json")).version;
  assert.equal(sw, app);
  assert.equal(app, pkg);
});

test("every precached file exists", async () => {
  const sw = await read("sw.js");
  const list = sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  for (const f of list) {
    if (f === "./") continue;
    assert.ok(await exists(f), `missing precache file: ${f}`);
  }
});

test("every JS module and CSS file is precached", async () => {
  const sw = await read("sw.js");
  const files = [...(await walk("js")), ...(await walk("css"))];
  for (const f of files) assert.ok(sw.includes(`"${f}"`), `not precached: ${f}`);
});

test("manifest is installable on Android and iOS-friendly", async () => {
  const m = JSON.parse(await read("manifest.webmanifest"));
  assert.equal(m.display, "standalone");
  assert.ok(m.name && m.short_name && m.start_url && m.scope && m.id);
  for (const icon of m.icons) {
    assert.ok(await exists(icon.src), `missing icon ${icon.src}`);
    const [w, h] = icon.sizes.split("x").map(Number);
    const dim = pngSize(await readFile(join(root, icon.src)));
    assert.deepEqual(dim, { w, h }, `${icon.src} real size differs from declared`);
  }
  assert.ok(m.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512"));
  assert.ok(m.icons.some((i) => i.purpose === "any" && i.sizes === "512x512"));
  const apple = pngSize(await readFile(join(root, "assets/icons/apple-touch-icon.png")));
  assert.deepEqual(apple, { w: 180, h: 180 });
});

test("index.html has iOS PWA tags and local-only references", async () => {
  const html = await read("index.html");
  for (const tag of ["apple-mobile-web-app-capable", "apple-touch-icon", "apple-mobile-web-app-status-bar-style", "viewport-fit=cover", 'rel="manifest"']) {
    assert.ok(html.includes(tag), `index.html missing ${tag}`);
  }
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]);
  for (const r of refs) {
    assert.ok(!/^https?:/.test(r), `external reference: ${r}`);
    assert.ok(await exists(r), `broken reference: ${r}`);
  }
});

test("no remote URLs in app code (no CDNs, no trackers)", async () => {
  const files = [...(await walk("js")), ...(await walk("css")), "index.html", "sw.js", "offline.html"];
  for (const f of files) {
    const text = await read(f);
    const remote = /(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import\s+["']?https?:|from\s+["']https?:|import\(\s*["']https?:|fetch\(\s*["'`]https?:|new URL\(\s*["']https?:\/\/(?!x)/i;
    assert.ok(!remote.test(text), `remote resource reference found in ${f}`);
  }
});

test("no inline event handlers or style attributes (CSP-safe)", async () => {
  const html = await read("index.html");
  assert.ok(!/\son[a-z]+=/i.test(html), "inline event handler in index.html");
  assert.ok(!/\sstyle="/i.test(html), "inline style attribute in index.html");
});
