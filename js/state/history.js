/** Undo/redo over whole-document snapshots. Rapid edits with the same group key
 *  (typing in one field) coalesce into a single undo step. */
export class History {
  constructor({ limit = 100, coalesceMs = 1000, now = () => Date.now() } = {}) {
    this.limit = limit;
    this.coalesceMs = coalesceMs;
    this.now = now;
    this.past = [];
    this.future = [];
    this.lastGroup = null;
    this.lastTime = 0;
  }

  /** Call BEFORE mutating. `snapshot` is a function so unchanged groups avoid cloning. */
  record(snapshot, group = null) {
    const t = this.now();
    const coalesce = group && group === this.lastGroup && t - this.lastTime < this.coalesceMs;
    this.lastGroup = group;
    this.lastTime = t;
    if (coalesce) return;
    this.past.push(snapshot());
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  /** @returns the snapshot to restore, or null */
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(current);
    this.lastGroup = null;
    return this.past.pop();
  }

  redo(current) {
    if (!this.future.length) return null;
    this.past.push(current);
    this.lastGroup = null;
    return this.future.pop();
  }

  clear() {
    this.past = [];
    this.future = [];
    this.lastGroup = null;
  }
}
