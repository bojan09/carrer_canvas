/** Crash-recovery "shadow" copies.
 *  IndexedDB writes are asynchronous and can be lost if a tab is killed right after an edit.
 *  When the page is hidden/closed while a save is pending, a SYNCHRONOUS copy goes into localStorage.
 *  On the next open of that document, a newer shadow is offered back (never applied silently). */
import { migrateRecord } from "../storage/migrations.js";

const PREFIX = "cc.shadow.";

export function writeShadow(doc, storage = globalThis.localStorage) {
  try {
    storage.setItem(PREFIX + doc.id, JSON.stringify({ savedAt: new Date().toISOString(), doc }));
    return true;
  } catch {
    return false; // quota or blocked storage: nothing more we can do
  }
}

export function clearShadow(id, storage = globalThis.localStorage) {
  try {
    storage.removeItem(PREFIX + id);
  } catch {
    /* ignore */
  }
}

/** @returns {{doc: object, savedAt: string} | null} only when the shadow is valid and newer than `stored` */
export function readNewerShadow(id, stored, storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(PREFIX + id);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const { savedAt, doc } = JSON.parse(raw);
    const clean = migrateRecord(doc);
    if (clean.id !== id) throw new Error("id mismatch");
    if (clean.updatedAt > stored.updatedAt) return { doc: clean, savedAt };
  } catch {
    /* unreadable shadow: drop it */
  }
  clearShadow(id, storage);
  return null;
}
