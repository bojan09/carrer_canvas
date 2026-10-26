import { APP_VERSION } from "../config.js";
import { ResumeDataError, SCHEMA_VERSION, newId } from "../models/resume.js";
import { migrateRecord } from "../storage/migrations.js";
import { cleanText } from "../utils/sanitization.js";

/** Versioned JSON backups. Pure functions: no storage, no DOM, nothing is executed from the file.
 *  Every document passes through the same migration + normalisation as stored data. */

export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_CHARS = 30_000_000;
export const MAX_DOCUMENTS = 500;

export function backupFileName(date = new Date(), single = null) {
  const day = date.toISOString().slice(0, 10);
  if (single) {
    const base = cleanText(single, 60).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return `careercanvas-${base || "document"}-${day}.json`;
  }
  return `careercanvas-backup-${day}.json`;
}

/** @param {object[]} docs normalised resumes. Photos are embedded only when includePhotos is true. */
export function buildBackup(docs, { includePhotos = false, now = new Date() } = {}) {
  const documents = docs.map((d) => {
    const copy = structuredClone(d);
    if (!includePhotos) copy.photo = null;
    return copy;
  });
  return {
    app: "CareerCanvas",
    kind: "backup",
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    includesPhotos: includePhotos,
    documents,
  };
}

const REASONS = {
  "newer-version": "was created by a newer version of CareerCanvas (update the app first)",
  invalid: "is not a valid CareerCanvas document",
  duplicate: "has the same id as another document in this file",
};

/**
 * Validates backup text without touching storage.
 * @returns {{ok: true, documents: object[], rejected: {label: string, reason: string}[], meta: object} | {ok: false, error: string}}
 */
export function parseBackup(text) {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "The file is empty." };
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: "The file is too large to be a CareerCanvas backup." };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This is not a JSON file, or it is damaged." };
  }

  let list;
  let meta = { exportedAt: null, includesPhotos: null, appVersion: null };
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === "object" && data.kind === "backup") {
    if (data.app !== "CareerCanvas") return { ok: false, error: "This backup was not made by CareerCanvas." };
    if (!Number.isInteger(data.format) || data.format > BACKUP_FORMAT) return { ok: false, error: "This backup uses a newer file format. Update CareerCanvas and try again." };
    if (!Array.isArray(data.documents)) return { ok: false, error: "The backup contains no document list." };
    list = data.documents;
    meta = { exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null, includesPhotos: data.includesPhotos === true, appVersion: cleanText(data.appVersion, 20) || null };
  } else if (data && typeof data === "object" && typeof data.id === "string" && (data.sections || data.kind === "cover-letter")) list = [data];
  else return { ok: false, error: "This file is not a CareerCanvas backup." };

  if (list.length > MAX_DOCUMENTS) return { ok: false, error: `The file lists more than ${MAX_DOCUMENTS} documents.` };

  const documents = [];
  const rejected = [];
  const seen = new Set();
  list.forEach((raw, i) => {
    const label = typeof raw?.title === "string" && raw.title ? cleanText(raw.title, 60) : `Item ${i + 1}`;
    try {
      const doc = migrateRecord(raw);
      if (seen.has(doc.id)) return rejected.push({ label, reason: REASONS.duplicate });
      seen.add(doc.id);
      documents.push(doc);
    } catch (err) {
      rejected.push({ label, reason: REASONS[err instanceof ResumeDataError ? err.code : "invalid"] || REASONS.invalid });
    }
  });
  return { ok: true, documents, rejected, meta };
}

/**
 * Decides what to write. Strategies for ids that already exist:
 *  'copy' (default) imports a renamed copy, 'replace' overwrites, 'skip' leaves the existing document.
 */
export function planImport(documents, existingIds, strategy = "copy") {
  const existing = new Set(existingIds);
  const toWrite = [];
  const summary = { added: 0, copied: 0, replaced: 0, skipped: 0 };
  for (const doc of documents) {
    if (!existing.has(doc.id)) {
      toWrite.push(doc);
      summary.added += 1;
    } else if (strategy === "replace") {
      toWrite.push(doc);
      summary.replaced += 1;
    } else if (strategy === "skip") {
      summary.skipped += 1;
    } else {
      toWrite.push({ ...doc, id: newId(), title: cleanText(`${doc.title} (imported)`, 120), updatedAt: new Date().toISOString() });
      summary.copied += 1;
    }
  }
  return { toWrite, summary };
}
