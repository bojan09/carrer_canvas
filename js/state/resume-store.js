import { getRepository } from "../storage/repository.js";
import { createSaveQueue } from "./save-queue.js";
import { History } from "./history.js";
import { onBeforeUpdateReload } from "../pwa/register.js";

const nowIso = () => new Date().toISOString();

/** One open document: in-memory working copy + undo history + autosave queue. */
export class ResumeSession {
  constructor(doc, repo) {
    this.doc = doc;
    this.repo = repo;
    this.history = new History();
    this.listeners = new Set();
    this.saveInfo = { state: "idle", lastSavedAt: null, error: null };
    this.queue = createSaveQueue({
      write: (d) => repo.put(d),
      onState: (info) => {
        this.saveInfo = info;
        this.emit({ type: "save" });
      },
    });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event) {
    this.listeners.forEach((fn) => fn(event));
  }

  /** Apply an edit. `structural` edits make the UI rebuild; text edits do not.
   *  `group` coalesces consecutive edits to the same field into one undo step. */
  change(mutator, { group = null, structural = false, focusKey = null, expand = null } = {}) {
    this.history.record(() => structuredClone(this.doc), group);
    mutator(this.doc);
    this.touch();
    this.emit({ type: "change", structural, focusKey, expand });
  }

  touch() {
    this.doc.updatedAt = nowIso();
    this.queue.schedule(() => structuredClone(this.doc));
  }

  undo() {
    const snap = this.history.undo(structuredClone(this.doc));
    if (snap) this.restore(snap);
    return Boolean(snap);
  }

  redo() {
    const snap = this.history.redo(structuredClone(this.doc));
    if (snap) this.restore(snap);
    return Boolean(snap);
  }

  restore(snapshot) {
    this.doc = snapshot;
    this.touch();
    this.emit({ type: "change", structural: true, focusKey: null, restored: true });
  }

  flush() {
    return this.queue.flush();
  }

  retrySave() {
    return this.queue.retry();
  }
}

let current = null;
let closing = Promise.resolve();

/** Resolves once every write from the current/previous session has finished.
 *  Call before reading from the repository (e.g. the Saved list). */
export async function settleSaves() {
  await closing;
  await current?.flush();
}

/** Opens (and switches) the active session. The previous one is flushed first. */
export async function openSession(id) {
  const repo = await getRepository();
  await closing;
  if (current?.doc.id === id) return current;
  await current?.flush();
  const doc = await repo.get(id); // may throw ResumeDataError
  if (!doc) return null;
  current = new ResumeSession(doc, repo);
  await repo.setLastResumeId(id).catch(() => {});
  return current;
}

export function closeSession() {
  const s = current;
  current = null;
  closing = Promise.all([closing, s?.flush()]).then(() => {});
  return closing;
}

export const activeSession = () => current;

// Never lose pending edits: flush when the tab is hidden/closed and before an app update reload.
const flushNow = () => current?.flush();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushNow();
});
window.addEventListener("pagehide", flushNow);
onBeforeUpdateReload(flushNow);
