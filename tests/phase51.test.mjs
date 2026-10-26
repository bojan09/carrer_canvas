import { test } from "node:test";
import assert from "node:assert/strict";
import { OPACITY_LIMITS, applyTemplate, contrastRatio, effectiveFill, mixHex, normalizeDesign, readableInk, resolveDesign } from "../js/templates/design.js";
import { DEFAULT_INK, DEFAULT_INK2, TEMPLATES, getTemplate } from "../js/templates/registry.js";
import { createBlank, createSample, normalizeResume, SCHEMA_VERSION } from "../js/models/resume.js";
import { LETTER_SCHEMA_VERSION, createLetterSample, normalizeLetter } from "../js/models/cover-letter.js";
import { migrateRecord } from "../js/storage/migrations.js";

test("new design overrides are validated: only hex colours, clamped opacity, strict flags", () => {
  const out = normalizeDesign({ textColor: "#AABBCC", mutedColor: "#123456", fillColor: "#0F766E", fillOpacity: 0.456, photoOpacity: 0.05, mirror: true, dateAlign: "right" });
  assert.deepEqual(out, { textColor: "#aabbcc", mutedColor: "#123456", fillColor: "#0f766e", fillOpacity: 0.46, photoOpacity: 0.2, mirror: true, dateAlign: "right" });
  assert.equal(normalizeDesign({ fillOpacity: 7 }).fillOpacity, 1);
  assert.equal(normalizeDesign({ fillOpacity: -3 }).fillOpacity, 0);
  assert.equal(normalizeDesign({ fillOpacity: 0 }).fillOpacity, 0, "fully transparent is allowed");
});

test("hostile or malformed override values are dropped, never stored", () => {
  const bad = normalizeDesign({
    textColor: "javascript:alert(1)",
    mutedColor: "red",
    fillColor: "#12",
    fillOpacity: "abc",
    photoOpacity: NaN,
    mirror: "yes",
    dateAlign: "center",
  });
  assert.deepEqual(bad, {});
  for (const v of [null, undefined, 5, [], "x"]) assert.deepEqual(normalizeDesign(v), {});
  assert.deepEqual(normalizeDesign({ textColor: "#fff", fillColor: "url(x)" }), {}, "short hex and CSS functions are rejected");
});

test("resolveDesign gives safe defaults and passes overrides through", () => {
  const doc = createBlank();
  const d = resolveDesign(doc);
  assert.equal(d.fillOpacity, 1);
  assert.equal(d.photoOpacity, 1);
  assert.equal(d.mirror, false);
  assert.equal(d.dateAlign, "left");
  assert.equal(d.textColor, undefined);
  doc.designSettings = { textColor: "#112233", fillOpacity: 0.4, mirror: true, dateAlign: "right" };
  const o = resolveDesign(doc);
  assert.equal(o.textColor, "#112233");
  assert.equal(o.fillOpacity, 0.4);
  assert.equal(o.mirror, true);
  assert.equal(o.dateAlign, "right");
});

test("switching template drops colour, opacity and flip overrides but keeps simplified and photo choices", () => {
  const doc = createBlank();
  doc.designSettings = { textColor: "#112233", mutedColor: "#445566", fillColor: "#778899", fillOpacity: 0.5, photoOpacity: 0.5, mirror: true, accent: "#ff0000", simplified: true, showPhoto: true, photoShape: "square" };
  applyTemplate(doc, "bento");
  assert.deepEqual(doc.designSettings, { simplified: true, showPhoto: true, photoShape: "square" });
});

test("colour maths: mixing, effective header fill and readable text colour", () => {
  assert.equal(mixHex("#ffffff", "#000000", 0.5), "#808080");
  assert.equal(mixHex("#102030", "#ffffff", 1), "#102030");
  assert.equal(mixHex("#102030", "#ffffff", 0), "#ffffff");
  // solid dark fill -> white text; solid pale fill -> dark text
  assert.equal(readableInk("#15151d", 1, "#ffffff"), "#ffffff");
  assert.equal(readableInk("#fde68a", 1, "#ffffff"), "#111111");
  // a dark fill that is mostly transparent over a white page reads as a pale surface -> dark text
  assert.equal(readableInk("#15151d", 0.1, "#ffffff"), "#111111");
  assert.equal(readableInk("#15151d", 0.1, "#0b1026"), "#ffffff", "...but over a dark page it stays dark, so white text");
  // whichever colour is chosen always meets the 4.5:1 target for solid fills
  for (const fill of ["#4f46e5", "#c0397b", "#0f766e", "#d63b25", "#1f2a44", "#c9791a", "#2a8a64", "#6d3fd6"]) {
    const ink = readableInk(fill, 1, "#ffffff");
    assert.ok(contrastRatio(ink, fill) >= 3, `${fill} with ${ink} is readable (${contrastRatio(ink, fill).toFixed(1)}:1)`);
  }
  const vertex = getTemplate("vertex");
  assert.equal(effectiveFill(vertex, { accent: "#d63b25" }), "#15151d", "Vertex has its own default fill");
  assert.equal(effectiveFill(vertex, { accent: "#d63b25", fillColor: "#ffee00" }), "#ffee00");
  assert.equal(effectiveFill(getTemplate("horizon"), { accent: "#c0397b" }), "#c0397b", "accent-based fills follow the accent");
  assert.equal(effectiveFill(getTemplate("prism"), { accent: "#ffffff" }), mixHex("#ffffff", "#0b1020", 0.68), "Prism darkens its fill");
});

test("registry flags are consistent for every template", () => {
  for (const t of TEMPLATES) {
    assert.equal(typeof t.supports.mirror, "boolean", `${t.id}.supports.mirror`);
    assert.equal(typeof t.supports.fills, "boolean", `${t.id}.supports.fills`);
    if (t.headerInk) assert.ok(t.supports.fills, `${t.id}: header text can only adapt to a fill it can change`);
    const dark = contrastRatio(t.paperBg, "#000000") < 3; // dark page on screen
    assert.equal(Boolean(t.printsOnWhite), dark, `${t.id}: dark-on-screen templates (and only those) print on white`);
    for (const key of ["ink", "ink2"]) if (t[key]) assert.match(t[key], /^#[0-9a-f]{6}$/i, `${t.id}.${key}`);
    assert.ok(t.atsConscious ? !t.supports.fills : true, `${t.id}: plain ATS-conscious templates have no decorative fills`);
  }
  assert.match(DEFAULT_INK, /^#[0-9a-f]{6}$/i);
  assert.match(DEFAULT_INK2, /^#[0-9a-f]{6}$/i);
  assert.equal(getTemplate("bloom").supports.mirror, false, "Bloom's motif collides with a flipped photo");
  assert.ok(OPACITY_LIMITS.photoOpacity.min >= 0.2, "a photo can never be faded out completely by accident");
});

test("schema bump: older records migrate, content and design survive, newer ones are refused", () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(LETTER_SCHEMA_VERSION, 2);
  const v2 = createSample();
  v2.schemaVersion = 2;
  v2.designSettings = { accent: "#aa3322", simplified: true };
  const up = migrateRecord(v2);
  assert.equal(up.schemaVersion, 3);
  assert.equal(up.contact.fullName, v2.contact.fullName);
  assert.deepEqual(up.designSettings, { accent: "#aa3322", simplified: true });
  const l1 = createLetterSample();
  l1.schemaVersion = 1;
  const upL = migrateRecord(l1);
  assert.equal(upL.schemaVersion, 2);
  assert.equal(upL.body.length, l1.body.length);
  assert.throws(() => migrateRecord({ ...createBlank(), schemaVersion: 4 }), (e) => e.code === "newer-version");
  assert.throws(() => migrateRecord({ ...createLetterSample(), schemaVersion: 3 }), (e) => e.code === "newer-version");
});

test("resumes and letters round-trip the new settings unchanged", () => {
  const settings = { textColor: "#112233", mutedColor: "#445566", fillColor: "#778899", fillOpacity: 0.35, photoOpacity: 0.6, mirror: true };
  const r = createSample();
  r.designSettings = { ...settings };
  assert.deepEqual(normalizeResume(JSON.parse(JSON.stringify(r))).designSettings, settings);
  const l = createLetterSample();
  l.designSettings = { ...settings, dateAlign: "right" };
  assert.deepEqual(normalizeLetter(JSON.parse(JSON.stringify(l))).designSettings, { ...settings, dateAlign: "right" });
});
