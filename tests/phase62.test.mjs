import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { MOVE_LIMITS, applyTemplate, normalizeDesign, normalizeMoves, resolveDesign, FONT_FAMILIES } from "../js/templates/design.js";
import { createSample } from "../js/models/resume.js";
import { createLetterSample } from "../js/models/cover-letter.js";
import { migrateRecord } from "../js/storage/migrations.js";
import { SCHEMA_VERSION } from "../js/models/resume.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("moves are validated: known block ids only, clamped, rounded to half a millimetre, zero offsets dropped", () => {
  const out = normalizeMoves({
    identity: { x: 3.26, y: -2 },
    contact: { x: 999, y: -999 },
    "sec:experience": { x: "4", y: null },
    "sec:abc_1-2": { x: 1, y: 1 },
    nope: { x: 5, y: 5 },
    "sec:bad id": { x: 5, y: 5 },
    "sec:<img>": { x: 5, y: 5 },
    date: { x: 0, y: 0 },
    closing: "x",
  });
  assert.deepEqual(out, {
    identity: { x: 3.5, y: -2 },
    contact: { x: MOVE_LIMITS.max, y: MOVE_LIMITS.min },
    "sec:experience": { x: 4, y: 0 },
    "sec:abc_1-2": { x: 1, y: 1 },
  });
  assert.deepEqual(normalizeMoves([1, 2]), {});
  assert.deepEqual(normalizeMoves(null), {});
  const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`sec:s${i}`, { x: 1, y: 1 }]));
  assert.ok(Object.keys(normalizeMoves(many)).length <= 40, "capped");
});

test("moves survive normalizeDesign and resolveDesign", () => {
  const d = normalizeDesign({ moves: { identity: { x: 2, y: 3 } } });
  assert.deepEqual(d.moves, { identity: { x: 2, y: 3 } });
  assert.equal(normalizeDesign({ moves: {} }).moves, undefined);
  const doc = createSample();
  doc.designSettings = d;
  assert.deepEqual(resolveDesign(doc).moves, { identity: { x: 2, y: 3 } });
  assert.deepEqual(resolveDesign(createSample()).moves, {});
});

test("switching template drops moves (positions belong to one layout) and counts them", () => {
  const doc = createSample();
  doc.designSettings = { moves: { identity: { x: 2, y: 3 } }, accent: "#ff0000" };
  const { dropped } = applyTemplate(doc, "swiss");
  assert.equal(dropped, 1);
  assert.equal(doc.designSettings.moves, undefined);
  assert.equal(doc.designSettings.accent, "#ff0000");
});

test("records are versioned for moves: v4 resumes and v3 letters upgrade, newer ones are refused", () => {
  assert.equal(SCHEMA_VERSION, 5);
  const old = { ...createSample(), schemaVersion: 4 };
  assert.equal(migrateRecord(old).schemaVersion, 5);
  const letter = { ...createLetterSample(), schemaVersion: 3 };
  assert.equal(migrateRecord(letter).schemaVersion, 4);
  assert.throws(() => migrateRecord({ ...createSample(), schemaVersion: 99 }), /newer/);
});

test("every bundled face is a real file with italic and Cyrillic, and DM Sans / Space Grotesk fall back to bundled Inter", () => {
  const css = read("css/fonts.css");
  const sw = read("sw.js");
  const urls = [...css.matchAll(/url\("\.\.\/(assets\/fonts\/[^"]+\.woff2)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 50);
  for (const u of urls) {
    assert.ok(existsSync(new URL(`../${u}`, import.meta.url)), `${u} exists`);
    assert.ok(sw.includes(`"${u}"`), `${u} precached`);
  }
  for (const slug of ["inter", "lora", "playfair-display", "source-serif-4", "jetbrains-mono"]) {
    assert.ok(urls.some((u) => u.includes(`${slug}-cyrillic-wght-normal`)), `${slug} has Cyrillic`);
    assert.ok(urls.some((u) => u.includes(`${slug}-latin-wght-italic`)), `${slug} has a real italic`);
  }
  assert.ok(urls.some((u) => u.includes("inter-greek")), "Greek is bundled");
  assert.match(FONT_FAMILIES["dm-sans"].stack, /"Inter Variable"/);
  assert.match(FONT_FAMILIES["space-grotesk"].stack, /"Inter Variable"/);
  assert.match(css, /font-style: italic/);
  assert.match(css, /cyrillic/);
});

test("build-fonts script and sw markers exist so the font list can be regenerated", () => {
  assert.ok(existsSync(new URL("../scripts/build-fonts.mjs", import.meta.url)));
  assert.match(read("sw.js"), /\/\/ fonts:start[\s\S]*\/\/ fonts:end/);
});
