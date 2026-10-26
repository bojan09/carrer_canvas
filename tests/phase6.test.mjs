import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The settings module touches window/localStorage at import time, so provide minimal browser globals first.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document = { documentElement: { setAttribute() {} }, querySelector: () => null };
const { whenSlow } = await import("../js/components/skeleton.js");
const { SHORTCUT_GROUPS } = await import("../js/components/shortcuts.js");
const { TOUR_STEPS } = await import("../js/components/tour.js");

test("tour steps are well formed, short and honest", () => {
  assert.ok(TOUR_STEPS.length >= 3 && TOUR_STEPS.length <= 6, "a tour should stay short");
  const seen = new Set();
  for (const s of TOUR_STEPS) {
    assert.match(s.target, /^\[data-tour="[a-z-]+"\]$/);
    assert.ok(!seen.has(s.target), "targets are unique");
    seen.add(s.target);
    assert.ok(s.title.length > 0 && s.title.length <= 40, `title: ${s.title}`);
    assert.ok(s.text.length >= 20 && s.text.length <= 220, `text length: ${s.title}`);
    assert.ok(!/guarantee|AI|ATS|score of/i.test(`${s.title} ${s.text}`), "no overclaiming");
  }
});

test("every tour target exists in the editor source (so a renamed attribute cannot silently break the tour)", () => {
  const studio = readFileSync(new URL("../js/editors/studio.js", import.meta.url), "utf8");
  for (const s of TOUR_STEPS) {
    const name = /data-tour="([a-z-]+)"/.exec(s.target)[1];
    assert.ok(new RegExp(`(data-tour"?:? ?=? ?"${name}")|(dataset\\.tour = "${name}")|("data-tour": "${name}")`).test(studio), `studio.js must set data-tour="${name}"`);
  }
});

test("keyboard shortcut list only has entries with keys and a label, and no duplicate combinations", () => {
  const combos = new Set();
  let n = 0;
  for (const g of SHORTCUT_GROUPS) {
    assert.ok(g.title && g.items.length);
    for (const it of g.items) {
      n += 1;
      assert.ok(it.keys.length >= 1 && it.label.length > 3);
      const key = it.keys.join("+").toLowerCase();
      assert.ok(!combos.has(key), `duplicate shortcut ${key}`);
      combos.add(key);
    }
  }
  assert.ok(n >= 6);
  assert.ok(combos.has("?") && combos.has("mod+z") && combos.has("mod+p"));
});

test("shortcuts listed in the help are actually handled in the source", () => {
  const studio = readFileSync(new URL("../js/editors/studio.js", import.meta.url), "utf8");
  const shortcuts = readFileSync(new URL("../js/components/shortcuts.js", import.meta.url), "utf8");
  assert.match(studio, /toLowerCase\(\) === "s"/, "Ctrl/Cmd+S handled");
  assert.match(studio, /\["1", "2", "3"\]/, "Alt+1/2/3 handled");
  assert.match(studio, /k === "z"/, "undo/redo handled");
  assert.match(shortcuts, /e\.key !== "\?"/, "? handled");
});

test("skeletons appear only when loading is genuinely slow and can be cancelled", async () => {
  const mk = () => ({ replaced: 0, replaceChildren() { this.replaced += 1; } });
  let done = false;
  const fast = mk();
  whenSlow(fast, () => "skel", () => done, 20);
  done = true;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(fast.replaced, 0, "a fast load never shows a skeleton");

  done = false;
  const slow = mk();
  whenSlow(slow, () => "skel", () => done, 20);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(slow.replaced, 1, "a slow load shows one");

  const cancelled = mk();
  const cancel = whenSlow(cancelled, () => "skel", () => false, 20);
  cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(cancelled.replaced, 0, "leaving the page cancels it");
});

test("service worker precaches every new Phase 6 module", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const f of ["js/utils/flip.js", "js/components/tour.js", "js/components/shortcuts.js", "js/components/skeleton.js"]) assert.ok(sw.includes(`"${f}"`), f);
});

test("settings: the tour flag is a strict boolean and Reset keeps records, not preferences", async () => {
  const mod = await import("../js/state/settings.js?phase6");
  assert.equal(mod.getSettings().tourSeen, false);
  mod.updateSettings({ tourSeen: true, lastBackupAt: "2026-01-01T00:00:00.000Z", theme: "light", pageSize: "Letter" });
  mod.resetSettings();
  const s = mod.getSettings();
  assert.equal(s.theme, "dark", "preferences reset");
  assert.equal(s.tourSeen, true, "the tour is not replayed by a reset");
  assert.equal(s.lastBackupAt, "2026-01-01T00:00:00.000Z", "the backup date is a record and survives a reset");
  store.set("cc.settings.v1", JSON.stringify({ tourSeen: "yes" }));
  const again = await import("../js/state/settings.js?phase6b");
  assert.equal(again.getSettings().tourSeen, false, "non-boolean values are ignored");
});
