import { createIdbStore } from "./idb.js";
import { createMemoryStore } from "./memory.js";
import { migrateRecord } from "./migrations.js";

let repoPromise = null;

/** Opens IndexedDB once; falls back to an in-memory store (with `persistent: false`)
 *  so the editor stays usable when storage is blocked. */
export function getRepository() {
  if (!repoPromise) repoPromise = build();
  return repoPromise;
}

async function build() {
  let store;
  let openError = null;
  try {
    store = await createIdbStore();
  } catch (err) {
    openError = err;
    store = createMemoryStore();
  }

  return {
    kind: store.kind,
    persistent: store.kind === "idb",
    openError,

    /** @returns {{items: object[], unreadable: {id:string, code:string}[]}} newest first */
    async list() {
      const raws = await store.all();
      const items = [];
      const unreadable = [];
      for (const raw of raws) {
        try {
          items.push(migrateRecord(raw));
        } catch (err) {
          unreadable.push({ id: raw?.id ?? "?", code: err.code || "invalid" });
        }
      }
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { items, unreadable };
    },

    /** Throws ResumeDataError for unreadable or newer-version records. */
    async get(id) {
      const raw = await store.get(id);
      return raw ? migrateRecord(raw) : null;
    },

    put: (doc) => store.put(doc),
    remove: (id) => store.remove(id),
    clear: async () => {
      await store.clear();
      await store.setMeta("lastResumeId", null);
      await store.setMeta("lastLetterId", null);
    },
    getLastResumeId: () => store.getMeta("lastResumeId"),
    setLastResumeId: (id) => store.setMeta("lastResumeId", id),
    getLastLetterId: () => store.getMeta("lastLetterId"),
    setLastLetterId: (id) => store.setMeta("lastLetterId", id),
  };
}
