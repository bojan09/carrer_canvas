import { ResumeDataError, SCHEMA_VERSION, normalizeResume } from "../models/resume.js";
import { LETTER_KIND, migrateLetter } from "../models/cover-letter.js";

/** One function per version step: MIGRATIONS[n] upgrades a record from n to n+1.
 *  Add a step whenever SCHEMA_VERSION is bumped, and never edit old steps. */
export const MIGRATIONS = {
  // Records without a version predate versioning; they already match the v1 shape.
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
  // v2 (Phase 3): validated template id, design overrides and optional photo. Records keep their content;
  // an older app version refuses v2 records instead of silently dropping the photo.
  1: (doc) => ({ ...doc, schemaVersion: 2 }),
};

/** Upgrades and validates a raw stored record. Throws ResumeDataError when it cannot be used
 *  (including records written by a newer app version, which must never be overwritten). */
export function migrateRecord(raw) {
  if (!raw || typeof raw !== "object") throw new ResumeDataError("invalid", "Not a CareerCanvas resume.");
  if (raw.kind === LETTER_KIND) return migrateLetter(raw); // cover letters have their own schema version
  let version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new ResumeDataError("newer-version", "This document was created by a newer version of CareerCanvas.");
  }
  let doc = raw;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new ResumeDataError("invalid", `No migration from schema version ${version}.`);
    doc = step(doc);
    version += 1;
  }
  return normalizeResume(doc);
}
