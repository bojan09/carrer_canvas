import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_FORMAT, backupFileName, buildBackup, parseBackup, planImport } from "../js/export/backup.js";
import { pageRuleText, pdfFileName } from "../js/export/print.js";
import { clearShadow, readNewerShadow, writeShadow } from "../js/state/shadow.js";
import { createBlank, createSample, SCHEMA_VERSION } from "../js/models/resume.js";

const withPhoto = () => {
  const d = createSample();
  d.photo = { data: "data:image/jpeg;base64,/9j/4AAQ", width: 320, height: 320 };
  d.designSettings = { showPhoto: true };
  return d;
};

// ---------- backup ----------
test("backup envelope is versioned and omits photos unless asked", () => {
  const d = withPhoto();
  const without = buildBackup([d]);
  assert.equal(without.kind, "backup");
  assert.equal(without.format, BACKUP_FORMAT);
  assert.equal(without.schemaVersion, SCHEMA_VERSION);
  assert.equal(without.includesPhotos, false);
  assert.equal(without.documents[0].photo, null);
  assert.ok(d.photo, "source document is not mutated");
  const withP = buildBackup([d], { includePhotos: true });
  assert.ok(withP.documents[0].photo);
  assert.equal(withP.includesPhotos, true);
});

test("backup round trip preserves every document exactly (content, order, template, design)", () => {
  const a = createSample();
  a.templateId = "vertex";
  a.designSettings = { accent: "#aa3322", fontPair: "classic", titleScale: 1.3, dividerStyle: "dotted" };
  a.pageSize = "Letter";
  const b = withPhoto();
  b.sectionOrder.reverse();
  const text = JSON.stringify(buildBackup([a, b], { includePhotos: true }));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rejected.length, 0);
  assert.deepEqual(parsed.documents, [a, b]);
});

test("backup file names are safe and dated", () => {
  const day = new Date("2026-03-04T10:00:00Z");
  assert.equal(backupFileName(day), "careercanvas-backup-2026-03-04.json");
  assert.equal(backupFileName(day, 'My "CV"/final: v2?'), "careercanvas-my-cv-final-v2-2026-03-04.json");
  assert.equal(backupFileName(day, "///"), "careercanvas-document-2026-03-04.json");
});

test("parseBackup rejects non-json, empty, foreign and newer-format files", () => {
  assert.equal(parseBackup("").ok, false);
  assert.equal(parseBackup("not json {").ok, false);
  assert.equal(parseBackup(JSON.stringify({ hello: "world" })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ kind: "backup", app: "Other", format: 1, documents: [] })).ok, false);
  const newer = parseBackup(JSON.stringify({ kind: "backup", app: "CareerCanvas", format: BACKUP_FORMAT + 1, documents: [] }));
  assert.equal(newer.ok, false);
  assert.match(newer.error, /newer/);
  assert.equal(parseBackup("x".repeat(31_000_000)).ok, false);
});

test("parseBackup accepts a bare single resume and an array of resumes", () => {
  const d = createSample();
  assert.equal(parseBackup(JSON.stringify(d)).documents.length, 1);
  assert.equal(parseBackup(JSON.stringify([d, createBlank()])).documents.length, 2);
});

test("invalid, newer-version and duplicate documents are rejected individually, valid ones kept", () => {
  const good = createSample();
  const future = { ...createBlank("From the future"), schemaVersion: SCHEMA_VERSION + 1 };
  const dup = structuredClone(good);
  const text = JSON.stringify({ kind: "backup", app: "CareerCanvas", format: 1, documents: [good, { nope: true }, future, dup] });
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.documents.length, 1);
  assert.equal(parsed.rejected.length, 3);
  assert.ok(parsed.rejected.some((r) => /newer version/.test(r.reason)));
  assert.ok(parsed.rejected.some((r) => /same id/.test(r.reason)));
});

test("imported documents are sanitised: hostile photo, markup and oversize data are neutralised, nothing executes", () => {
  const d = createSample();
  d.contact.fullName = '<img src=x onerror=alert(1)>' + "x".repeat(500);
  d.photo = { data: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", width: 5, height: 5 };
  d.designSettings = { accent: "javascript:alert(1)", evil: true };
  d.sections.experience.items[0].bullets[0].text = "ok\u0000‮";
  const parsed = parseBackup(JSON.stringify({ kind: "backup", app: "CareerCanvas", format: 1, documents: [d] }));
  const out = parsed.documents[0];
  assert.equal(out.photo, null);
  assert.deepEqual(out.designSettings, {});
  assert.equal(out.contact.fullName.length, 100);
  assert.equal(out.sections.experience.items[0].bullets[0].text, "ok");
});

test("import strategies: copy keeps both, replace overwrites, skip ignores", () => {
  const a = createSample();
  const fresh = createBlank("Brand new");
  const docs = [a, fresh];
  const existing = [a.id];

  const copy = planImport(docs, existing, "copy");
  assert.deepEqual(copy.summary, { added: 1, copied: 1, replaced: 0, skipped: 0 });
  const copied = copy.toWrite.find((d) => d.title.endsWith("(imported)"));
  assert.ok(copied && copied.id !== a.id);

  const replace = planImport(docs, existing, "replace");
  assert.deepEqual(replace.summary, { added: 1, copied: 0, replaced: 1, skipped: 0 });
  assert.ok(replace.toWrite.some((d) => d.id === a.id));

  const skip = planImport(docs, existing, "skip");
  assert.deepEqual(skip.summary, { added: 1, copied: 0, replaced: 0, skipped: 1 });
  assert.equal(skip.toWrite.length, 1);
});

// ---------- print ----------
test("PDF file name is derived from the person's name and is filesystem-safe", () => {
  const d = createBlank();
  d.contact.fullName = 'Ana / María: "O\'Neil"?';
  assert.equal(pdfFileName(d), "Ana María O'Neil - Resume");
  const empty = createBlank("My CV");
  assert.equal(pdfFileName(empty), "My CV - Resume");
  const blank = createBlank("///");
  blank.title = "///";
  assert.equal(pdfFileName(blank), "Resume - Resume");
});

test("@page rule uses the document's paper size and margin setting", () => {
  const d = createBlank();
  d.templateId = "grid";
  assert.equal(pageRuleText(d), "@page { size: A4; margin: 16mm; }");
  d.pageSize = "Letter";
  d.designSettings = { margins: 22 };
  assert.equal(pageRuleText(d), "@page { size: letter; margin: 22mm; }");
});

// ---------- shadow (crash recovery) ----------
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m };
};

test("a newer valid shadow copy is offered; an older one is dropped", () => {
  const st = memStorage();
  const stored = createSample();
  stored.updatedAt = "2026-01-01T10:00:00.000Z";
  const newer = structuredClone(stored);
  newer.updatedAt = "2026-01-01T10:05:00.000Z";
  newer.contact.fullName = "Recovered Name";
  assert.equal(writeShadow(newer, st), true);
  const found = readNewerShadow(stored.id, stored, st);
  assert.equal(found.doc.contact.fullName, "Recovered Name");

  const older = structuredClone(stored);
  older.updatedAt = "2025-12-31T10:00:00.000Z";
  writeShadow(older, st);
  assert.equal(readNewerShadow(stored.id, stored, st), null);
  assert.equal(st._m.size, 0, "stale shadow removed");
});

test("corrupt, foreign or newer-schema shadows are discarded safely", () => {
  const st = memStorage();
  const stored = createSample();
  st.setItem(`cc.shadow.${stored.id}`, "{not json");
  assert.equal(readNewerShadow(stored.id, stored, st), null);
  assert.equal(st._m.size, 0);
  const other = createBlank();
  other.updatedAt = "2999-01-01T00:00:00.000Z";
  writeShadow(other, st);
  st.setItem(`cc.shadow.${stored.id}`, st.getItem(`cc.shadow.${other.id}`));
  assert.equal(readNewerShadow(stored.id, stored, st), null, "id mismatch rejected");
  clearShadow(stored.id, st);
});

test("writeShadow reports failure instead of throwing when storage is full or blocked", () => {
  const full = { setItem() { throw new Error("QuotaExceededError"); }, getItem: () => null, removeItem() {} };
  assert.equal(writeShadow(createBlank(), full), false);
});

// ---------- guard: every page module's imports resolve (caught a missing getSettings import) ----------
import { readFile, readdir } from "node:fs/promises";
test("page modules import every settings helper they use", async () => {
  for (const f of await readdir(new URL("../js/pages/", import.meta.url))) {
    const src = await readFile(new URL(`../js/pages/${f}`, import.meta.url), "utf8");
    for (const name of ["getSettings", "updateSettings"]) {
      if (new RegExp(`\\b${name}\\(`).test(src)) assert.match(src, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "\\.\\./state/settings\\.js"`), `${f} uses ${name} without importing it`);
    }
  }
});
