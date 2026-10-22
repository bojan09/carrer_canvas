/** Serialised, debounced autosave.
 *  - Only one write is in flight at a time, so an older write can never land after a newer one.
 *  - A change made during a write triggers another write after it finishes.
 *  - On failure the latest document is kept pending so a retry or the next edit saves it.
 *  States: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' */
export function createSaveQueue({ write, delay = 600, onState = () => {} }) {
  let pending = null; // function returning the latest document
  let timer = null;
  let running = null;
  let state = "idle";
  let lastSavedAt = null;
  let lastError = null;

  const set = (next) => {
    state = next;
    onState({ state, lastSavedAt, error: lastError });
  };

  function run() {
    clearTimeout(timer);
    if (running) return running;
    running = (async () => {
      try {
        while (pending) {
          const getDoc = pending;
          pending = null;
          set("saving");
          try {
            await write(getDoc());
          } catch (err) {
            pending = pending || getDoc; // keep the data; a later edit or retry saves it
            lastError = err;
            set("error");
            return;
          }
        }
        lastError = null;
        lastSavedAt = new Date();
        set("saved");
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    schedule(getDoc) {
      pending = getDoc;
      clearTimeout(timer);
      set("dirty");
      timer = setTimeout(run, delay);
    },
    /** Resolves when everything scheduled so far has been written (or has failed). */
    flush() {
      if (!pending && !running) return Promise.resolve();
      return run();
    },
    retry() {
      return run();
    },
    get hasPending() {
      return Boolean(pending) || Boolean(running);
    },
    get state() {
      return state;
    },
    get lastSavedAt() {
      return lastSavedAt;
    },
  };
}
