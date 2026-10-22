/** In-memory fallback store used when IndexedDB is unavailable (private mode, blocked storage).
 *  Same raw interface as idb.js. Nothing here survives closing the tab. */
export function createMemoryStore() {
  const resumes = new Map();
  const meta = new Map();
  return {
    kind: "memory",
    async all() {
      return [...resumes.values()].map((v) => structuredClone(v));
    },
    async get(id) {
      return resumes.has(id) ? structuredClone(resumes.get(id)) : undefined;
    },
    async put(doc) {
      resumes.set(doc.id, structuredClone(doc));
    },
    async remove(id) {
      resumes.delete(id);
    },
    async clear() {
      resumes.clear();
    },
    async getMeta(key) {
      return meta.get(key);
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
  };
}
