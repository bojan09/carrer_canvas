import { APP_VERSION } from "../config.js";
import { cleanText } from "../utils/sanitization.js";
import { CONTACT_FIELDS } from "./section-defs.js";
import { DEFAULT_TEMPLATE_ID, TEMPLATE_IDS } from "../templates/registry.js";
import { normalizeDesign } from "../templates/design.js";
import { PAGE_SIZES, ResumeDataError, normalizePhoto, newId } from "./resume.js";
import { SAMPLE_PHOTO } from "./sample-photo.js";

/** Cover letter documents. They live in the same store as resumes and are told apart by `kind`.
 *  A letter has its own schema version; it shares template id, design overrides, page size, contact block
 *  and optional photo with resumes so the same templates and design panel work for both. */

export const LETTER_KIND = "cover-letter";
export const LETTER_SCHEMA_VERSION = 1;
export const LETTER_LIMITS = { bodyParagraphs: 3, links: 10 };
export const LETTER_FIELD_MAX = { name: 120, title: 120, company: 120, address: 300, role: 160, greeting: 160, opening: 1500, paragraph: 3000, closing: 120, signature: 120 };

export const isLetter = (doc) => doc?.kind === LETTER_KIND;

const nowIso = () => new Date().toISOString();
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const iso = (v, fallback) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback);
const idOf = (v) => (typeof v === "string" && v.length > 0 && v.length <= 80 ? cleanText(v, 80) : newId());

/** "YYYY-MM-DD" that is a real calendar date, else "". */
export function cleanDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof v === "string" ? v : "");
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? v : "";
}

export const todayIso = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** Long, locale-aware date for the letter. */
export function formatLetterDate(value, locale) {
  const v = cleanDate(value);
  if (!v) return "";
  const [y, m, d] = v.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(locale || undefined, { dateStyle: "long" }).format(new Date(y, m - 1, d));
  } catch {
    return v;
  }
}

export const emptyParagraph = () => ({ id: newId(), text: "" });

export function createBlankLetter(title = "Untitled cover letter", pageSize = "A4") {
  const stamp = nowIso();
  return {
    id: newId(),
    kind: LETTER_KIND,
    schemaVersion: LETTER_SCHEMA_VERSION,
    title,
    createdAt: stamp,
    updatedAt: stamp,
    templateId: DEFAULT_TEMPLATE_ID,
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : "A4",
    designSettings: {},
    contact: Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, ""])),
    links: [],
    photo: null,
    recipient: { name: "", title: "", company: "", address: "" },
    role: "",
    date: "",
    greeting: "",
    opening: "",
    body: [emptyParagraph()],
    closing: "",
    signature: "",
    metadata: { isSample: false, createdWith: APP_VERSION, copiedFromResume: false },
  };
}

/** Clearly fictional. Contains no invented facts about any real company or person. */
export function createLetterSample(pageSize = "A4") {
  const doc = createBlankLetter("Sample cover letter (fictional)", pageSize);
  doc.metadata.isSample = true;
  Object.assign(doc.contact, {
    fullName: "Alex Sample",
    title: "Product Designer (sample)",
    email: "alex.sample@example.com",
    phone: "+00 000 000 000",
    location: "Sampletown, Exampleland",
    website: "example.com/alex-sample",
  });
  doc.photo = { ...SAMPLE_PHOTO };
  doc.designSettings = { showPhoto: true };
  doc.recipient = { name: "Jordan Example", title: "Hiring Manager (sample)", company: "Example Company", address: "1 Sample Street\nExampletown" };
  doc.role = "Senior Designer (sample)";
  doc.date = "2026-01-15";
  doc.greeting = "Dear Jordan Example,";
  doc.opening = "Sample text: I am writing to apply for the Senior Designer role at Example Company. Replace this paragraph with your own opening.";
  doc.body = [
    { id: newId(), text: "Sample text: say why this role and this company interest you, using something you can verify from their own website or job posting." },
    { id: newId(), text: "Sample text: describe one or two experiences that match what the role asks for, what you did, how you did it and what changed." },
  ];
  doc.closing = "Sincerely,";
  doc.signature = "Alex Sample";
  return doc;
}

/** Copies details from a resume the user chose. Never links back or changes the resume. */
export function copyDetailsFromResume(letter, resume, { includePhoto = false } = {}) {
  for (const f of CONTACT_FIELDS) letter.contact[f.key] = cleanText(resume.contact?.[f.key], f.max);
  letter.links = (resume.links || []).slice(0, LETTER_LIMITS.links).map((l) => ({ id: newId(), label: cleanText(l.label, 60), url: cleanText(l.url, 300) }));
  letter.signature = letter.signature || letter.contact.fullName;
  if (includePhoto && resume.photo) {
    letter.photo = structuredClone(resume.photo);
    letter.designSettings.showPhoto = true;
  }
  letter.templateId = TEMPLATE_IDS.includes(resume.templateId) ? resume.templateId : letter.templateId;
  letter.designSettings = { ...letter.designSettings, ...pickLook(resume.designSettings) };
  letter.metadata.copiedFromResume = true;
}

const pickLook = (design) => {
  const clean = normalizeDesign(design);
  delete clean.showPhoto;
  return clean;
};

/** Validates and repairs a stored or imported letter. Throws ResumeDataError when unusable. */
export function normalizeLetter(raw) {
  if (!isObj(raw) || raw.kind !== LETTER_KIND || typeof raw.id !== "string" || !raw.id) {
    throw new ResumeDataError("invalid", "Not a CareerCanvas cover letter.");
  }
  const version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
  if (version > LETTER_SCHEMA_VERSION) {
    throw new ResumeDataError("newer-version", "This document was created by a newer version of CareerCanvas.");
  }
  const doc = createBlankLetter();
  const M = LETTER_FIELD_MAX;
  doc.id = idOf(raw.id);
  doc.title = cleanText(raw.title, 120) || "Untitled cover letter";
  doc.createdAt = iso(raw.createdAt, doc.createdAt);
  doc.updatedAt = iso(raw.updatedAt, doc.createdAt);
  doc.templateId = TEMPLATE_IDS.includes(raw.templateId) ? raw.templateId : DEFAULT_TEMPLATE_ID;
  doc.pageSize = PAGE_SIZES.includes(raw.pageSize) ? raw.pageSize : "A4";
  doc.designSettings = normalizeDesign(raw.designSettings);
  doc.photo = normalizePhoto(raw.photo);
  const contact = isObj(raw.contact) ? raw.contact : {};
  for (const f of CONTACT_FIELDS) doc.contact[f.key] = cleanText(contact[f.key], f.max);
  doc.links = (Array.isArray(raw.links) ? raw.links : []).slice(0, LETTER_LIMITS.links).map((l) => ({ id: idOf(l?.id), label: cleanText(l?.label, 60), url: cleanText(l?.url, 300) }));
  const r = isObj(raw.recipient) ? raw.recipient : {};
  doc.recipient = { name: cleanText(r.name, M.name), title: cleanText(r.title, M.title), company: cleanText(r.company, M.company), address: cleanText(r.address, M.address, { multiline: true }) };
  doc.role = cleanText(raw.role, M.role);
  doc.date = cleanDate(raw.date);
  doc.greeting = cleanText(raw.greeting, M.greeting);
  doc.opening = cleanText(raw.opening, M.opening, { multiline: true });
  const body = (Array.isArray(raw.body) ? raw.body : []).slice(0, LETTER_LIMITS.bodyParagraphs).map((p) => ({ id: idOf(p?.id), text: cleanText(isObj(p) ? p.text : p, M.paragraph, { multiline: true }) }));
  doc.body = body.length ? body : [emptyParagraph()];
  doc.closing = cleanText(raw.closing, M.closing);
  doc.signature = cleanText(raw.signature, M.signature);
  doc.metadata = {
    isSample: raw.metadata?.isSample === true,
    createdWith: cleanText(raw.metadata?.createdWith, 20) || APP_VERSION,
    copiedFromResume: raw.metadata?.copiedFromResume === true,
  };
  doc.schemaVersion = LETTER_SCHEMA_VERSION;
  return doc;
}

/** One step per version, same rule as resumes: never edit old steps. */
export const LETTER_MIGRATIONS = {};

export function migrateLetter(raw) {
  let version = Number.isInteger(raw?.schemaVersion) ? raw.schemaVersion : 0;
  if (version > LETTER_SCHEMA_VERSION) throw new ResumeDataError("newer-version", "This document was created by a newer version of CareerCanvas.");
  let doc = raw;
  while (version < LETTER_SCHEMA_VERSION) {
    const step = LETTER_MIGRATIONS[version];
    if (!step) throw new ResumeDataError("invalid", `No migration from schema version ${version}.`);
    doc = step(doc);
    version += 1;
  }
  return normalizeLetter(doc);
}

export function duplicateLetter(doc, title) {
  const copy = structuredClone(doc);
  const stamp = nowIso();
  copy.id = newId();
  copy.title = cleanText(title || `${doc.title} (copy)`, 120);
  copy.createdAt = stamp;
  copy.updatedAt = stamp;
  return copy;
}

/** Plain text of every written part, for checks. */
export const letterText = (doc) => [doc.greeting, doc.opening, ...doc.body.map((p) => p.text), doc.closing].filter(Boolean).join("\n");
export const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);
