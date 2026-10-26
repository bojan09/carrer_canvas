import { test } from "node:test";
import assert from "node:assert/strict";
import { LETTER_KIND, LETTER_LIMITS, LETTER_SCHEMA_VERSION, cleanDate, copyDetailsFromResume, createBlankLetter, createLetterSample, duplicateLetter, formatLetterDate, isLetter, normalizeLetter, todayIso, wordCount } from "../js/models/cover-letter.js";
import { createBlank, createSample, ResumeDataError } from "../js/models/resume.js";
import { migrateRecord } from "../js/storage/migrations.js";
import { analyzeLetter, openLetterIssues, LETTER_PROMPTS } from "../js/editors/letter-hints.js";
import { buildBackup, parseBackup, planImport } from "../js/export/backup.js";
import { pdfFileName } from "../js/export/print.js";
import { clearShadow, readNewerShadow, writeShadow } from "../js/state/shadow.js";
import { TEMPLATE_IDS } from "../js/templates/registry.js";

const complete = () => {
  const d = createLetterSample();
  d.metadata.isSample = false;
  d.opening = "I am applying for the Senior Designer role at Example Company.";
  d.body = [{ id: "p1", text: "Example Company builds tools I use. My recent project taught me to test early." }];
  return d;
};

test("a blank letter has the required structure and no content", () => {
  const d = createBlankLetter();
  assert.equal(d.kind, LETTER_KIND);
  assert.equal(d.schemaVersion, LETTER_SCHEMA_VERSION);
  assert.ok(isLetter(d) && !isLetter(createBlank()));
  assert.equal(d.body.length, 1);
  assert.equal(d.body[0].text, "");
  assert.deepEqual(Object.keys(d.recipient).sort(), ["address", "company", "name", "title"]);
  assert.equal(d.photo, null);
  assert.equal(d.contact.fullName, "");
  assert.equal(d.greeting + d.opening + d.closing + d.signature + d.role + d.date, "", "nothing is pre-written for the user");
});

test("the sample is clearly fictional, has a photo, and survives normalisation unchanged in content", () => {
  const s = createLetterSample();
  assert.equal(s.metadata.isSample, true);
  assert.ok(s.photo && s.designSettings.showPhoto);
  assert.match(s.title, /fictional/i);
  assert.match(s.contact.email, /@example\.com$/);
  const n = normalizeLetter(JSON.parse(JSON.stringify(s)));
  assert.deepEqual({ ...n, updatedAt: 0, createdAt: 0 }, { ...s, updatedAt: 0, createdAt: 0 });
});

test("normalisation repairs bad data, drops hostile photos and caps lengths", () => {
  const raw = createLetterSample();
  raw.templateId = "nope";
  raw.pageSize = "Tabloid";
  raw.date = "2026-02-30";
  raw.photo = { data: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", width: 5, height: 5 };
  raw.designSettings = { accent: "red", fontPair: "x", margins: 9999 };
  raw.opening = "x".repeat(5000);
  raw.greeting = "Dear\u0000 <img src=x onerror=alert(1)> there‮,";
  raw.body = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, text: `para ${i}` }));
  raw.recipient = { name: 7, company: "C".repeat(500), address: "a\nb\r\nc" };
  const n = normalizeLetter(raw);
  assert.equal(n.templateId, "summit");
  assert.equal(n.pageSize, "A4");
  assert.equal(n.date, "");
  assert.equal(n.photo, null);
  assert.ok(n.designSettings.margins <= 30 && n.designSettings.accent === undefined);
  assert.equal(n.opening.length, 1500);
  assert.equal(n.body.length, LETTER_LIMITS.bodyParagraphs);
  assert.equal(n.recipient.name, "");
  assert.equal(n.recipient.company.length, 120);
  assert.equal(n.recipient.address, "a\nb\nc", "address keeps its line breaks");
  assert.ok(!/[\u0000‮]/.test(n.greeting), "control and bidi characters are removed");
  assert.ok(n.greeting.includes("<img"), "markup is kept as inert text (it is only ever rendered with textContent)");
  const empty = normalizeLetter({ id: "x", kind: LETTER_KIND, body: [] });
  assert.equal(empty.body.length, 1, "always at least one paragraph to type into");
});

test("unusable and newer-version records are refused, never repaired or overwritten", () => {
  assert.throws(() => normalizeLetter({ id: "a" }), (e) => e instanceof ResumeDataError && e.code === "invalid");
  assert.throws(() => normalizeLetter(null), ResumeDataError);
  const future = { ...createBlankLetter(), schemaVersion: LETTER_SCHEMA_VERSION + 1 };
  assert.throws(() => migrateRecord(future), (e) => e.code === "newer-version");
});

test("migrateRecord routes letters to the letter schema and leaves resumes alone", () => {
  const letter = migrateRecord(createLetterSample());
  assert.equal(letter.kind, LETTER_KIND);
  assert.ok(letter.body.length >= 1 && !("sections" in letter));
  const resume = migrateRecord(createSample());
  assert.ok(resume.sections && resume.kind === undefined);
});

test("every template id is accepted for a letter", () => {
  for (const id of TEMPLATE_IDS) assert.equal(normalizeLetter({ ...createBlankLetter(), templateId: id }).templateId, id);
});

test("copying from a resume is an explicit copy: details and look only, photo only on request, resume untouched", () => {
  const resume = createSample();
  resume.photo = { data: "data:image/jpeg;base64,/9j/4AAQ", width: 320, height: 320 };
  resume.templateId = "prism";
  resume.designSettings = { accent: "#2a8a64", showPhoto: true, simplified: false };
  resume.links = [{ id: "l1", label: "GitHub", url: "https://example.com/g" }];
  const before = JSON.stringify(resume);

  const letter = createBlankLetter();
  copyDetailsFromResume(letter, resume, { includePhoto: false });
  assert.equal(JSON.stringify(resume), before, "the resume is not modified");
  assert.equal(letter.contact.fullName, resume.contact.fullName);
  assert.equal(letter.contact.email, resume.contact.email);
  assert.equal(letter.signature, resume.contact.fullName);
  assert.equal(letter.templateId, "prism");
  assert.equal(letter.designSettings.accent, "#2a8a64");
  assert.equal(letter.photo, null, "photo is not copied unless asked");
  assert.equal(letter.designSettings.showPhoto, undefined);
  assert.equal(letter.links.length, 1);
  assert.notEqual(letter.links[0].id, "l1", "links get their own ids");
  assert.equal(letter.metadata.copiedFromResume, true);
  assert.equal(letter.opening + letter.body[0].text, "", "no resume content leaks into the letter text");

  const withPhoto = createBlankLetter();
  copyDetailsFromResume(withPhoto, resume, { includePhoto: true });
  assert.ok(withPhoto.photo);
  assert.notEqual(withPhoto.photo, resume.photo, "photo is a copy, not a shared reference");
  assert.equal(withPhoto.designSettings.showPhoto, true);
});

test("dates: only real calendar dates are kept and they format for display", () => {
  assert.equal(cleanDate("2026-01-15"), "2026-01-15");
  for (const bad of ["2026-02-30", "2026-13-01", "15/01/2026", "", null, "2026-1-5"]) assert.equal(cleanDate(bad), "");
  assert.equal(todayIso(new Date(2026, 0, 5)), "2026-01-05");
  assert.match(formatLetterDate("2026-01-15", "en-GB"), /15 January 2026/);
  assert.match(formatLetterDate("2026-01-15", "en-US"), /January 15, 2026/);
  assert.equal(formatLetterDate("nonsense"), "");
});

test("checklist: a blank letter is flagged; a complete one is clean; advice is non-judgemental", () => {
  const blank = analyzeLetter(createBlankLetter());
  const failing = blank.filter((c) => !c.ok).map((c) => c.id);
  for (const id of ["name", "reach", "company", "role", "greeting", "opening", "body", "closing"]) assert.ok(failing.includes(id), `${id} flagged`);
  assert.ok(!failing.includes("mentions") && !failing.includes("length"), "no company/length noise on an empty letter");

  const good = analyzeLetter(complete());
  assert.deepEqual(good.filter((c) => !c.ok).map((c) => c.id), [], "complete letter has nothing to flag");
  assert.equal(openLetterIssues(complete()), 0);
  assert.ok(!good.some((c) => /ats|guarantee|score/i.test(`${c.label} ${c.detail}`)), "no ATS or scoring claims");
});

test("checklist details: sample content, missing company mention, placeholders and length", () => {
  assert.ok(analyzeLetter(createLetterSample()).some((c) => c.id === "sample" && !c.ok));
  const d = complete();
  d.body[0].text = "A generic paragraph with no organisation named.";
  d.opening = "I am applying for the role.";
  assert.equal(analyzeLetter(d).find((c) => c.id === "mentions").ok, false);
  d.body[0].text = "Dear [Hiring Manager], I like Example Company. TODO";
  assert.equal(analyzeLetter(d).find((c) => c.id === "placeholders").ok, false);
  d.body[0].text = ("Example Company words ").repeat(250);
  assert.equal(analyzeLetter(d).find((c) => c.id === "length").ok, false);
  assert.equal(wordCount("  one two\nthree  "), 3);
  assert.equal(wordCount(""), 0);
});

test("structure prompts are guidance only: no generated copy, no company facts", () => {
  const all = [LETTER_PROMPTS.greeting, LETTER_PROMPTS.opening, LETTER_PROMPTS.closing, ...LETTER_PROMPTS.body].join(" ");
  assert.ok(LETTER_PROMPTS.body.length === LETTER_LIMITS.bodyParagraphs);
  assert.ok(!/\bAI\b|generated|guarantee|ATS/i.test(all));
  assert.match(all, /verify|support|stand behind/i, "prompts steer towards verifiable claims");
});

test("duplicate gives a new id and keeps content; PDF name says Cover Letter", () => {
  const a = complete();
  const b = duplicateLetter(a);
  assert.notEqual(a.id, b.id);
  assert.equal(b.title, `${a.title} (copy)`);
  assert.deepEqual(b.body, a.body);
  assert.equal(pdfFileName(a), "Alex Sample - Cover Letter");
  assert.equal(pdfFileName(createSample()), "Alex Sample - Resume");
  const nameless = createBlankLetter();
  assert.equal(pdfFileName(nameless), "Untitled cover letter - Cover Letter");
});

test("backup round trip carries resumes and letters together, with photos only when asked", () => {
  const r = createSample();
  const l = complete();
  const withoutPhotos = buildBackup([r, l]);
  assert.equal(withoutPhotos.documents.length, 2);
  assert.equal(withoutPhotos.documents[1].photo, null);
  assert.ok(l.photo, "source document is not mutated");
  const text = JSON.stringify(buildBackup([r, l], { includePhotos: true }));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rejected.length, 0);
  assert.deepEqual(parsed.documents.map(isLetter), [false, true]);
  const back = parsed.documents[1];
  assert.equal(back.recipient.company, l.recipient.company);
  assert.equal(back.templateId, l.templateId);
  assert.ok(back.photo);
});

test("a single exported letter file and a hostile letter are both handled safely", () => {
  const one = parseBackup(JSON.stringify(complete()));
  assert.equal(one.ok, true);
  assert.equal(one.documents.length, 1);
  const hostile = { ...complete(), photo: { data: "javascript:alert(1)", width: 1, height: 1 }, body: [{ id: "x", text: "<script>alert(1)</script>" }], greeting: "Hi\u0000" };
  const out = parseBackup(JSON.stringify({ app: "CareerCanvas", kind: "backup", format: 1, documents: [hostile, { kind: LETTER_KIND, id: "z", schemaVersion: 99 }] }));
  assert.equal(out.ok, true);
  assert.equal(out.documents[0].photo, null);
  assert.equal(out.documents[0].body[0].text, "<script>alert(1)</script>", "kept as inert text");
  assert.equal(out.rejected.length, 1);
  assert.match(out.rejected[0].reason, /newer version/);
});

test("importing a letter that already exists keeps both by default and never changes the original", () => {
  const l = complete();
  const { toWrite, summary } = planImport([l], [l.id], "copy");
  assert.equal(summary.copied, 1);
  assert.notEqual(toWrite[0].id, l.id);
  assert.ok(isLetter(toWrite[0]));
  assert.match(toWrite[0].title, /\(imported\)/);
});

test("crash-recovery shadow copies work for letters too", () => {
  const m = new Map();
  const st = { setItem: (k, v) => m.set(k, v), getItem: (k) => m.get(k) ?? null, removeItem: (k) => m.delete(k) };
  const stored = complete();
  stored.updatedAt = "2026-01-01T10:00:00.000Z";
  const newer = structuredClone(stored);
  newer.updatedAt = "2026-01-01T10:05:00.000Z";
  newer.opening = "Recovered opening";
  writeShadow(newer, st);
  const found = readNewerShadow(stored.id, stored, st);
  assert.equal(found.doc.opening, "Recovered opening");
  assert.ok(isLetter(found.doc));
  clearShadow(stored.id, st);
  assert.equal(m.size, 0);
});
