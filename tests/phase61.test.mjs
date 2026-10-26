import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ELEMENT_LIMITS, ELEMENT_ROLES, FONT_FAMILIES, PHOTO_LIMITS, WEIGHTS, applyTemplate, normalizeDesign, normalizeElements, resolveDesign } from "../js/templates/design.js";
import { SCHEMA_VERSION, createBlank, createSample, normalizeResume } from "../js/models/resume.js";
import { LETTER_SCHEMA_VERSION, createLetterSample, normalizeLetter } from "../js/models/cover-letter.js";
import { migrateRecord } from "../js/storage/migrations.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("element formatting is validated: only known roles, fonts, weights, hex colours and clamped numbers", () => {
  const out = normalizeElements({
    name: { color: "#AABBCC", font: "playfair", weight: 900, size: 34.567, track: 0.1234, italic: true, upper: false, align: "center" },
    body: { align: "justify", size: 2, track: 5 },
    heading: { align: "justify" },
    bogus: { color: "#000000" },
    meta: {},
  });
  assert.deepEqual(out.name, { color: "#aabbcc", font: "playfair", weight: 900, size: 34.57, track: 0.12, italic: true, upper: false, align: "center" });
  assert.deepEqual(out.body, { align: "justify", size: ELEMENT_LIMITS.size.min, track: ELEMENT_LIMITS.track.max }, "numbers are clamped; only body may justify");
  assert.equal(out.heading, undefined, "justify is not allowed for headings, and an empty role is dropped");
  assert.equal(out.bogus, undefined);
  assert.equal(out.meta, undefined);
});

test("hostile or malformed element values are discarded", () => {
  const out = normalizeElements({
    name: { color: "url(javascript:alert(1))", font: "Comic Sans; } body{display:none", weight: 450, size: "huge", track: NaN, italic: "yes", upper: 1, align: "diagonal" },
    role: { color: "red", font: "../../etc/passwd", weight: "700" },
    contact: { align: "justify" },
  });
  assert.deepEqual(out, {}, "nothing from those survives");
  for (const v of [null, undefined, 5, "x", [], [{ name: { color: "#000000" } }]]) assert.deepEqual(normalizeElements(v), {});
});

test("photo size and nudge are clamped integers in millimetres", () => {
  assert.deepEqual(normalizeDesign({ photoSize: 500, photoX: -999, photoY: 12.7 }), { photoSize: PHOTO_LIMITS.photoSize.max, photoX: PHOTO_LIMITS.photoX.min, photoY: 13 });
  assert.deepEqual(normalizeDesign({ photoSize: "big", photoX: null, photoY: "" }), {});
});

test("element settings live in designSettings.elements and survive normalisation for resumes and letters", () => {
  const elements = { name: { font: "inter", weight: 800, size: 30 }, body: { color: "#223344", align: "justify" } };
  const r = createSample();
  r.designSettings = { elements, photoSize: 40, photoX: -5 };
  assert.deepEqual(normalizeResume(JSON.parse(JSON.stringify(r))).designSettings, { elements, photoSize: 40, photoX: -5 });
  const l = createLetterSample();
  l.designSettings = { elements: { body: elements.body } };
  assert.deepEqual(normalizeLetter(JSON.parse(JSON.stringify(l))).designSettings, { elements: { body: elements.body } });
  const d = resolveDesign({ ...createBlank(), designSettings: { elements } });
  assert.deepEqual(d.elements, elements);
  assert.deepEqual(resolveDesign(createBlank()).elements, {});
});

test("schema version bump: v3 records migrate untouched, newer are refused", () => {
  assert.ok(SCHEMA_VERSION >= 4 && LETTER_SCHEMA_VERSION >= 3);
  const v3 = { ...createSample(), schemaVersion: 3 };
  v3.designSettings = { accent: "#aa3322", mirror: true };
  const up = migrateRecord(v3);
  assert.equal(up.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(up.designSettings, { accent: "#aa3322", mirror: true });
  const l2 = { ...createLetterSample(), schemaVersion: 2 };
  assert.equal(migrateRecord(l2).schemaVersion, LETTER_SCHEMA_VERSION);
});

test("switching template reports and clears custom element styles but keeps photo choices", () => {
  const doc = createBlank();
  doc.designSettings = { elements: { name: { weight: 900 } }, photoSize: 40, accent: "#ff0000", showPhoto: true, simplified: true };
  const { dropped } = applyTemplate(doc, "bento");
  assert.equal(dropped, 3, "elements, photoSize and accent were reset");
  assert.deepEqual(doc.designSettings, { showPhoto: true, simplified: true });
  assert.equal(applyTemplate(doc, "orbit").dropped, 0, "nothing custom to lose");
});

test("every bundled font is real: stack, @font-face, file, licence and offline precache", () => {
  const css = read("css/fonts.css");
  const sw = read("sw.js");
  const bundled = Object.values(FONT_FAMILIES).filter((f) => /Variable/.test(f.stack));
  assert.equal(bundled.length, 7);
  for (const f of bundled) {
    const family = /"([^"]+ Variable)"/.exec(f.stack)[1];
    assert.ok(css.includes(`font-family: "${family}"`), `@font-face for ${family}`);
    assert.ok(/serif|sans-serif|monospace/.test(f.stack), `${f.label} has a generic fallback so non-Latin text still renders`);
  }
  for (const m of css.matchAll(/url\("\.\.\/(assets\/fonts\/([a-z0-9-]+)\/[^"]+\.woff2)"\)/g)) {
    assert.ok(existsSync(new URL(`../${m[1]}`, import.meta.url)), `${m[1]} exists`);
    assert.ok(sw.includes(`"${m[1]}"`), `${m[1]} is precached for offline use`);
    assert.ok(/SIL OPEN FONT LICENSE/i.test(read(`assets/fonts/${m[2]}/LICENSE.txt`)), `${m[2]} ships its licence`);
  }
  for (const f of Object.values(FONT_FAMILIES)) assert.ok(f.group && f.label && f.stack);
  assert.deepEqual(WEIGHTS.map(([w]) => w), [400, 500, 600, 700, 800, 900]);
});

test("elements.css has a rule for every role and property the renderer can switch on", () => {
  const css = read("css/templates/elements.css");
  for (const role of Object.keys(ELEMENT_ROLES)) {
    for (const prop of ["color", "font", "weight", "size", "italic", "upper-on", "upper-off", "track", "align"]) {
      assert.ok(css.includes(`[data-st~="${role}-${prop}"] [data-role="${role}"]`), `${role}-${prop}`);
    }
  }
  for (const t of ["photo-size", "photo-move", "contact-align"]) assert.ok(css.includes(`data-st~="${t}"`), t);
  assert.ok(!/@media print[^{]*\{[^}]*stage/.test(css), "picking outlines never apply to paper");
});

test("renderer only uses data-role values the system knows, and tags every kind of text", () => {
  const src = read("js/preview/render.js");
  const used = new Set([...src.matchAll(/"data-role": "([a-z]+)"/g)].map((m) => m[1]));
  const known = new Set([...Object.keys(ELEMENT_ROLES), "photo"]);
  for (const r of used) assert.ok(known.has(r), `unknown role ${r}`);
  for (const r of known) assert.ok(used.has(r), `role ${r} is never rendered`);
});

test("Format panel only offers alignment where it can work and never for headings or titles", () => {
  assert.ok(ELEMENT_ROLES.body.justify && !ELEMENT_ROLES.name.justify);
  for (const r of ["heading", "title", "meta"]) assert.ok(!ELEMENT_ROLES[r].align, `${r} has no alignment control`);
});
