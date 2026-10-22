const DB_NAME = "careercanvas";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) return reject(new Error("IndexedDB is not available"));
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return reject(err);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("resumes")) {
        db.createObjectStore("resumes", { keyPath: "id" }).createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close(); // let a newer tab upgrade the schema
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB open was blocked"));
  });
}

/** Raw IndexedDB store. Rejects (so the caller can fall back) when the database cannot be used. */
export async function createIdbStore() {
  const db = await openDatabase();

  const run = (storeName, mode, fn) =>
    new Promise((resolve, reject) => {
      let request;
      let tx;
      try {
        tx = db.transaction(storeName, mode);
        request = fn(tx.objectStore(storeName));
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || request?.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });

  return {
    kind: "idb",
    all: () => run("resumes", "readonly", (s) => s.getAll()),
    get: (id) => run("resumes", "readonly", (s) => s.get(id)),
    put: (doc) => run("resumes", "readwrite", (s) => s.put(doc)),
    remove: (id) => run("resumes", "readwrite", (s) => s.delete(id)),
    clear: () => run("resumes", "readwrite", (s) => s.clear()),
    getMeta: (key) => run("meta", "readonly", (s) => s.get(key)),
    setMeta: (key, value) => run("meta", "readwrite", (s) => s.put(value, key)),
  };
}
