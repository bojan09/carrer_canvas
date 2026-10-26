import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES, TEMPLATE_IDS, getTemplate } from "../js/templates/registry.js";
import { ACCENT_SWATCHES, FONT_PAIRS, LIMITS, applyTemplate, contrastRatio, normalizeDesign, photoVisible, renderTemplateOf, resolveDesign } from "../js/templates/design.js";
import { SCHEMA_VERSION, createBlank, createSample, normalizePhoto, normalizeResume, PHOTO_MAX_CHARS } from "../js/models/resume.js";
import { migrateRecord } from "../js/storage/migrations.js";
import { ResumeDataError } from "../js/models/resume.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const exists = (f) => stat(join(root, f)).then(() => true, () => false);

test("fifteen distinct templates with the required identities", () => {
  assert.equal(TEMPLATES.length, 15);
  assert.deepEqual([...TEMPLATE_IDS].sort(), ["aurora", "bento", "bloom", "glass", "grid", "horizon", "mono", "nexus", "orbit", "prism", "slate", "summit", "swiss", "velo", "vertex"]);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 15);
});

test("Summit and Grid are single-column, ATS-conscious, plain skills; photos are opt-in and never part of the simplified layout", () => {
  assert.equal(getTemplate("grid").supports.photo, true, "opt-in photo is allowed, with a warning");
  assert.ok(getTemplate("grid").warnings.length > 0);
  assert.equal(getTemplate("summit").supports.photo, true, "opt-in photo is allowed, with a warning");
  assert.ok(getTemplate("summit").warnings.length > 0);
  for (const id of ["summit", "grid"]) {
    const t = getTemplate(id);
    assert.equal(t.layout, "single");
    assert.equal(t.atsConscious, true);
    assert.equal(t.skills, "text");
    assert.deepEqual(t.side, []);
  }
});

test("decorative templates warn and can be simplified; sidebars declare which sections move", () => {
  for (const t of TEMPLATES.filter((x) => !x.atsConscious)) assert.ok(t.warnings.length > 0, `${t.id} needs a layout warning`);
  for (const t of TEMPLATES.filter((x) => x.layout !== "single")) assert.ok(t.side.length > 0);
});

test("every template has a stylesheet and valid defaults", async () => {
  assert.ok(await exists("css/templates/doc.css"));
  for (const t of TEMPLATES) {
    assert.ok(await exists(`css/templates/${t.id}.css`), `missing css for ${t.id}`);
    const d = normalizeDesign(t.defaults);
    for (const k of Object.keys(LIMITS)) assert.equal(d[k], t.defaults[k], `${t.id}.${k} outside limits`);
    assert.ok(FONT_PAIRS[t.defaults.fontPair]);
    assert.match(t.defaults.accent, /^#[0-9a-f]{6}$/i);
  }
});

test("design settings are clamped and unknown keys dropped", () => {
  const d = normalizeDesign({ accent: "red", titleScale: 99, bodyScale: -3, lineHeight: "x", margins: 500, sectionGap: 1, dividerStyle: "wavy", fontPair: "comic", evil: "<script>", showPhoto: "yes", simplified: true });
  assert.deepEqual(d, { titleScale: LIMITS.titleScale.max, bodyScale: LIMITS.bodyScale.min, margins: LIMITS.margins.max, sectionGap: LIMITS.sectionGap.min, simplified: true });
  assert.deepEqual(normalizeDesign(null), {});
  assert.equal(normalizeDesign({ accent: "#ABCDEF" }).accent, "#abcdef");
});

test("resolveDesign merges defaults with overrides; header alignment is locked where unsupported", () => {
  const doc = createBlank();
  doc.templateId = "grid";
  doc.designSettings = { accent: "#ff0000", headerAlign: "center" };
  const d = resolveDesign(doc);
  assert.equal(d.accent, "#ff0000");
  assert.equal(d.headerAlign, "left", "Grid fixes header alignment");
  assert.equal(d.lineHeight, getTemplate("grid").defaults.lineHeight);
});

test("simplified mode renders Summit structure for decorative templates, but never changes ATS templates", () => {
  const doc = createBlank();
  doc.templateId = "aurora";
  assert.equal(renderTemplateOf(doc).id, "aurora");
  doc.designSettings = { simplified: true };
  assert.equal(renderTemplateOf(doc).id, "summit");
  doc.templateId = "grid";
  assert.equal(renderTemplateOf(doc).id, "grid");
  assert.equal(resolveDesign(doc).simplified, false);
});

test("photo is shown only when stored, explicitly enabled and supported by the rendered layout", () => {
  const doc = createBlank();
  doc.photo = { data: "data:image/jpeg;base64,AAAA", width: 320, height: 320 };
  doc.templateId = "velo";
  assert.equal(photoVisible(doc), false, "off until enabled");
  doc.designSettings = { showPhoto: true };
  assert.equal(photoVisible(doc), true);
  doc.designSettings = { showPhoto: true, simplified: true };
  assert.equal(photoVisible(doc), false, "simplified layout has no photo");
  doc.designSettings = { showPhoto: true };
  doc.templateId = "summit";
  assert.equal(photoVisible(doc), true, "Summit shows an explicitly enabled photo");
  doc.designSettings = { showPhoto: true, simplified: true };
  doc.templateId = "velo";
  assert.equal(photoVisible(doc), false, "simplified never shows a photo");
  doc.designSettings = { showPhoto: true };
  doc.templateId = "grid";
  assert.equal(photoVisible(doc), true, "Grid shows an explicitly enabled photo");
});

test("applyTemplate keeps content and layout-independent choices, drops visual overrides", () => {
  const doc = createSample();
  doc.designSettings = { accent: "#ff0000", fontPair: "classic", simplified: true, showPhoto: true, photoShape: "square" };
  const before = JSON.stringify([doc.contact, doc.sections, doc.sectionOrder]);
  applyTemplate(doc, "nexus");
  assert.equal(doc.templateId, "nexus");
  assert.deepEqual(doc.designSettings, { simplified: true, showPhoto: true, photoShape: "square" });
  assert.equal(JSON.stringify([doc.contact, doc.sections, doc.sectionOrder]), before);
  applyTemplate(doc, "nope");
  assert.equal(doc.templateId, "summit", "unknown ids fall back");
});

test("contrast ratio and swatch sanity", () => {
  assert.ok(contrastRatio("#000000", "#ffffff") > 20);
  assert.ok(contrastRatio("#ffffff", "#ffffff") < 1.01);
  assert.ok(contrastRatio("#f4d58a", "#ffffff") < 4.5, "pale yellow on white is flagged");
  for (const c of ACCENT_SWATCHES) assert.match(c, /^#[0-9a-f]{6}$/i);
});

test("photo normalisation accepts only our own JPEG data URLs within the size cap", () => {
  const ok = { data: "data:image/jpeg;base64,/9j/4AAQ", width: 320, height: 320 };
  assert.ok(normalizePhoto(ok));
  assert.equal(normalizePhoto({ data: "data:image/svg+xml;base64,PHN2Zz4=" }), null);
  assert.equal(normalizePhoto({ data: "https://example.com/a.jpg" }), null);
  assert.equal(normalizePhoto({ data: "data:image/jpeg;base64," + "A".repeat(PHOTO_MAX_CHARS) }), null);
  assert.equal(normalizePhoto({ data: "javascript:alert(1)" }), null);
  assert.equal(normalizePhoto(null), null);
});

test("schema v2: v1 records migrate, content and photo survive, templateId and design are repaired", () => {
  assert.equal(SCHEMA_VERSION, 4);
  const v1 = createSample();
  v1.schemaVersion = 1;
  v1.templateId = "does-not-exist";
  v1.designSettings = { accent: "#123456", junk: 1 };
  v1.photo = { data: "data:image/jpeg;base64,/9j/4AAQ", width: 320, height: 320 };
  const out = migrateRecord(v1);
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  assert.equal(out.templateId, "summit");
  assert.deepEqual(out.designSettings, { accent: "#123456" });
  assert.ok(out.photo);
  assert.deepEqual(out.sections.experience, v1.sections.experience);
});

test("future-version records are still refused", () => {
  assert.throws(() => migrateRecord({ ...createBlank(), schemaVersion: SCHEMA_VERSION + 1 }), (e) => e instanceof ResumeDataError && e.code === "newer-version");
});

test("normalize round-trips a styled document unchanged", () => {
  const d = createSample();
  d.templateId = "vertex";
  d.designSettings = { accent: "#aa3322", fontPair: "classic", titleScale: 1.3, dividerStyle: "dotted", simplified: false };
  d.pageSize = "Letter";
  assert.deepEqual(normalizeResume(structuredClone(d)), { ...d, designSettings: normalizeDesign(d.designSettings) });
});
