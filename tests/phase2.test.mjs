import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, safeUrl } from "../js/utils/sanitization.js";
import { validators, validateRange } from "../js/utils/validation.js";
import { History } from "../js/state/history.js";
import { createSaveQueue } from "../js/state/save-queue.js";
import { SCHEMA_VERSION, ResumeDataError, createBlank, createSample, duplicateResume, normalizeResume, emptyCustomSection } from "../js/models/resume.js";
import { migrateRecord } from "../js/storage/migrations.js";
import { createMemoryStore } from "../js/storage/memory.js";
import { analyze } from "../js/editors/hints.js";

// ---------- sanitization ----------
test("safeUrl accepts http(s) and bare domains, rejects dangerous schemes", () => {
  assert.equal(safeUrl("example.com/a"), "https://example.com/a");
  assert.equal(safeUrl("https://example.com"), "https://example.com/");
  assert.equal(safeUrl("http://example.com"), "http://example.com/");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x", "file:///etc/passwd", "mailto:a@b.co", "ftp://example.com", "not a url", "localhostx", ""]) {
    assert.equal(safeUrl(bad), "", `should reject ${bad}`);
  }
});

test("cleanText strips control and bidi characters and enforces limits", () => {
  assert.equal(cleanText("a\u0000b‮c"), "abc");
  assert.equal(cleanText("x".repeat(50), 10).length, 10);
  assert.equal(cleanText("line1\nline2"), "line1 line2");
  assert.equal(cleanText("line1\nline2", 100, { multiline: true }), "line1\nline2");
  assert.equal(cleanText(42), "");
});

test("hostile text survives round trip as data, never markup", () => {
  const doc = createBlank();
  doc.contact.fullName = '<img src=x onerror=alert(1)>"\'';
  const out = normalizeResume(doc);
  assert.equal(out.contact.fullName, '<img src=x onerror=alert(1)>"\'');
});

// ---------- validation ----------
test("validators", () => {
  assert.equal(validators.email("a@b.co"), "");
  assert.notEqual(validators.email("nope"), "");
  assert.equal(validators.email(""), "");
  assert.equal(validators.tel("+44 20 7946 0958"), "");
  assert.notEqual(validators.tel("abc"), "");
  assert.equal(validators.month("2022-03"), "");
  assert.notEqual(validators.month("2022-13"), "");
  assert.notEqual(validators.month("March 2022"), "");
  assert.notEqual(validateRange("2022-05", "2021-01", false), "");
  assert.equal(validateRange("2022-05", "2021-01", true), "");
  assert.equal(validateRange("2020-01", "2021-01", false), "");
});

// ---------- history ----------
test("history coalesces rapid same-group edits and supports undo/redo", () => {
  let t = 0;
  const h = new History({ now: () => t });
  let state = "a";
  const edit = (next, group) => {
    h.record(() => state, group);
    state = next;
  };
  edit("ab", "f");
  t += 100;
  edit("abc", "f"); // coalesced
  t += 2000;
  edit("abcd", "f"); // new step (time gap)
  edit("X", "g"); // different group
  assert.equal(h.past.length, 3);
  state = h.undo(state);
  assert.equal(state, "abcd");
  state = h.undo(state);
  assert.equal(state, "abc"); // typing "ab" then "abc" within 1s was one step; the later pause starts a new one
  state = h.undo(state);
  assert.equal(state, "a");
  state = h.redo(state);
  state = h.redo(state);
  assert.equal(state, "abcd");
  edit("new", null);
  assert.equal(h.canRedo, false, "new edit clears redo");
});

test("history limit drops the oldest snapshot", () => {
  const h = new History({ limit: 3 });
  for (let i = 0; i < 10; i++) h.record(() => i, null);
  assert.equal(h.past.length, 3);
  assert.deepEqual(h.past, [7, 8, 9]);
});

// ---------- save queue ----------
test("save queue serialises writes and the newest document always wins", async () => {
  const writes = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const q = createSaveQueue({
    delay: 5,
    write: async (doc) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      writes.push(doc.v);
      inFlight--;
    },
  });
  q.schedule(() => ({ v: 1 }));
  await new Promise((r) => setTimeout(r, 15)); // write 1 in flight
  q.schedule(() => ({ v: 2 }));
  q.schedule(() => ({ v: 3 }));
  await q.flush();
  assert.equal(maxInFlight, 1);
  assert.equal(writes.at(-1), 3);
  assert.ok(!writes.includes(2) || writes.indexOf(2) < writes.indexOf(3));
  assert.equal(q.state, "saved");
});

test("save queue keeps data pending after a failure and retries", async () => {
  let fail = true;
  const written = [];
  const q = createSaveQueue({
    delay: 1,
    write: async (d) => {
      if (fail) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
      written.push(d.v);
    },
  });
  q.schedule(() => ({ v: 1 }));
  await q.flush();
  assert.equal(q.state, "error");
  assert.equal(q.hasPending, true);
  fail = false;
  await q.retry();
  assert.deepEqual(written, [1]);
  assert.equal(q.state, "saved");
});

test("flush resolves immediately when nothing is pending", async () => {
  const q = createSaveQueue({ write: async () => {} });
  await q.flush();
  assert.equal(q.state, "idle");
});

// ---------- model ----------
test("blank resume has the expected shape and no fabricated content", () => {
  const d = createBlank();
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(d.sectionOrder, ["summary", "experience", "education", "skills", "projects", "certifications", "languages"]);
  assert.equal(d.contact.fullName, "");
  assert.equal(d.sections.experience.items.length, 0);
  assert.equal(d.metadata.isSample, false);
});

test("sample is flagged, fictional and contains no invented percentages", () => {
  const s = createSample();
  assert.equal(s.metadata.isSample, true);
  assert.match(s.title, /sample/i);
  assert.ok(!/\d+\s?%/.test(JSON.stringify(s)));
  assert.ok(s.contact.email.endsWith("@example.com"));
});

test("normalizeResume round-trips a valid document unchanged", () => {
  const s = createSample();
  assert.deepEqual(normalizeResume(structuredClone(s)), s);
});

test("normalizeResume repairs bad data: unknown ids, missing sections, wrong types", () => {
  const raw = createSample();
  raw.sectionOrder = ["ghost", "experience", "experience", 7];
  delete raw.sections.skills;
  raw.sections.experience.items[0].current = "yes";
  raw.sections.experience.items[0].bullets = "oops";
  raw.contact = null;
  raw.pageSize = "B5";
  const d = normalizeResume(raw);
  assert.equal(d.sectionOrder.filter((x) => x === "experience").length, 1);
  assert.ok(!d.sectionOrder.includes("ghost"));
  assert.ok(d.sectionOrder.includes("skills") && d.sections.skills.items.length === 0);
  assert.equal(d.sections.experience.items[0].current, false);
  assert.deepEqual(d.sections.experience.items[0].bullets, []);
  assert.equal(d.pageSize, "A4");
  assert.equal(d.contact.fullName, "");
});

test("normalizeResume enforces size limits", () => {
  const raw = createBlank();
  raw.sections.experience.items = Array.from({ length: 80 }, () => ({}));
  raw.contact.fullName = "x".repeat(5000);
  const d = normalizeResume(raw);
  assert.equal(d.sections.experience.items.length, 50);
  assert.equal(d.contact.fullName.length, 100);
});

test("custom sections persist and keep their place in the order", () => {
  const d = createBlank();
  const c = emptyCustomSection("Volunteering", "bullets");
  d.sections[c.id] = c;
  d.sectionOrder.splice(2, 0, c.id);
  const out = normalizeResume(structuredClone(d));
  assert.equal(out.sectionOrder[2], c.id);
  assert.equal(out.sections[c.id].title, "Volunteering");
  assert.equal(out.sections[c.id].mode, "bullets");
});

test("duplicateResume makes an independent copy with a new id", () => {
  const s = createSample();
  const c = duplicateResume(s);
  assert.notEqual(c.id, s.id);
  c.sections.experience.items[0].title = "changed";
  assert.notEqual(s.sections.experience.items[0].title, "changed");
});

// ---------- migrations ----------
test("unversioned records migrate to the current schema", () => {
  const legacy = createSample();
  delete legacy.schemaVersion;
  assert.equal(migrateRecord(legacy).schemaVersion, SCHEMA_VERSION);
});

test("records from a newer app version are refused, never downgraded", () => {
  const future = { ...createBlank(), schemaVersion: SCHEMA_VERSION + 1 };
  assert.throws(() => migrateRecord(future), (e) => e instanceof ResumeDataError && e.code === "newer-version");
});

test("garbage records are rejected", () => {
  for (const bad of [null, 5, "x", {}, { id: "" }]) assert.throws(() => migrateRecord(bad), ResumeDataError);
});

// ---------- storage (memory) ----------
test("memory store: put/get/all/remove/clear are isolated copies", async () => {
  const store = createMemoryStore();
  const d = createBlank();
  await store.put(d);
  d.title = "mutated after put";
  assert.notEqual((await store.get(d.id)).title, "mutated after put");
  assert.equal((await store.all()).length, 1);
  await store.setMeta("lastResumeId", d.id);
  assert.equal(await store.getMeta("lastResumeId"), d.id);
  await store.remove(d.id);
  assert.equal(await store.get(d.id), undefined);
});

// ---------- writing checklist ----------
test("checklist flags real problems without inventing scores", () => {
  const d = createBlank();
  let checks = analyze(d);
  assert.ok(checks.find((c) => c.id === "name" && !c.ok));
  assert.ok(checks.find((c) => c.id === "email" && !c.ok));
  d.contact.fullName = "Real Person";
  d.contact.email = "real@example.org";
  checks = analyze(d);
  assert.ok(checks.find((c) => c.id === "name").ok);
  assert.ok(checks.find((c) => c.id === "email").ok);
  assert.ok(checks.every((c) => !("score" in c)));
});

test("checklist detects repeated bullets, bad dates and sample content", () => {
  const d = createSample();
  const items = d.sections.experience.items;
  items[1].bullets.push({ id: "z", text: items[0].bullets[0].text });
  items[1].endDate = "2018-01";
  const checks = analyze(d);
  assert.ok(!checks.find((c) => c.id === "duplicates").ok);
  assert.ok(!checks.find((c) => c.id === "dates").ok);
  assert.ok(!checks.find((c) => c.id === "sample").ok);
});
