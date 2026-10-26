import { APP_VERSION } from "../config.js";
import { cleanText } from "../utils/sanitization.js";
import { BUILTIN_ORDER, CONTACT_FIELDS, SECTION_DEFS } from "./section-defs.js";
import { DEFAULT_TEMPLATE_ID, TEMPLATE_IDS } from "../templates/registry.js";
import { normalizeDesign } from "../templates/design.js";

export const SCHEMA_VERSION = 2;
export const PHOTO_MAX_CHARS = 150_000; // data-URL length cap (~110 KB of image data)
export const LIMITS = { entries: 50, bullets: 30, tags: 60, links: 10, customSections: 20 };
export const PAGE_SIZES = ["A4", "Letter"];

export class ResumeDataError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ResumeDataError";
    this.code = code; // 'invalid' | 'newer-version'
  }
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const nowIso = () => new Date().toISOString();

export function emptyItem(type) {
  const item = { id: newId() };
  for (const f of SECTION_DEFS[type].fields) {
    item[f.key] = f.type === "checkbox" ? false : f.type === "bullets" || f.type === "tags" ? [] : "";
  }
  return item;
}

export function emptyBullet() {
  return { id: newId(), text: "" };
}

export function emptyLink() {
  return { id: newId(), label: "", url: "" };
}

export function emptyCustomSection(title = "Custom section", mode = "text") {
  return { id: newId(), type: "custom", visible: true, title, mode, text: "", bullets: [] };
}

function builtinSection(type) {
  const def = SECTION_DEFS[type];
  return def.kind === "text" ? { id: type, type, visible: true, text: "" } : { id: type, type, visible: true, items: [] };
}

export function createBlank(title = "Untitled resume", pageSize = "A4") {
  const sections = Object.fromEntries(BUILTIN_ORDER.map((t) => [t, builtinSection(t)]));
  const stamp = nowIso();
  return {
    id: newId(),
    schemaVersion: SCHEMA_VERSION,
    title,
    createdAt: stamp,
    updatedAt: stamp,
    templateId: DEFAULT_TEMPLATE_ID,
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : "A4",
    designSettings: {},
    contact: Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, ""])),
    links: [],
    photo: null,
    sectionOrder: [...BUILTIN_ORDER],
    sections,
    metadata: { isSample: false, createdWith: APP_VERSION },
  };
}

/** Clearly fictional content. Contains no invented metrics. Must be replaced before real use. */
export function createSample(pageSize = "A4") {
  const doc = createBlank("Sample resume (fictional)", pageSize);
  doc.metadata.isSample = true;
  Object.assign(doc.contact, {
    fullName: "Alex Sample",
    title: "Product Designer (sample)",
    email: "alex.sample@example.com",
    phone: "+00 000 000 000",
    location: "Sampletown, Exampleland",
    website: "example.com/alex-sample",
    linkedin: "",
  });
  doc.sections.summary.text =
    "Sample text: product designer who enjoys turning unclear problems into simple, usable interfaces. Replace this paragraph with a short summary of your own background and goals.";
  doc.sections.experience.items = [
    {
      ...emptyItem("experience"),
      title: "Senior Designer (sample)",
      organization: "Example Company",
      location: "Sampletown",
      startDate: "2022-01",
      current: true,
      bullets: [
        { id: newId(), text: "Led the redesign of an onboarding flow together with engineers and researchers." },
        { id: newId(), text: "Built a shared component library to keep product screens consistent." },
      ],
    },
    {
      ...emptyItem("experience"),
      title: "Designer (sample)",
      organization: "Placeholder Studio",
      location: "Exampleville",
      startDate: "2019-06",
      endDate: "2021-12",
      bullets: [{ id: newId(), text: "Prototyped and tested interface ideas with customers before development." }],
    },
  ];
  doc.sections.education.items = [
    { ...emptyItem("education"), program: "BA Design (sample)", school: "Sample University", startDate: "2015-09", endDate: "2019-06" },
  ];
  doc.sections.skills.items = [
    { ...emptyItem("skills"), label: "Design", items: ["Interaction design", "Prototyping", "User research"] },
    { ...emptyItem("skills"), label: "Tools", items: ["Figma", "HTML and CSS"] },
  ];
  doc.sections.languages.items = [
    { ...emptyItem("languages"), language: "English", proficiency: "Fluent" },
  ];
  return doc;
}

export function duplicateResume(doc, title) {
  const copy = structuredClone(doc);
  const stamp = nowIso();
  copy.id = newId();
  copy.title = cleanText(title || `${doc.title} (copy)`, 120);
  copy.createdAt = stamp;
  copy.updatedAt = stamp;
  return copy;
}

// ---------- normalisation (used for every load and, later, imports) ----------

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const iso = (v, fallback) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : fallback);
const id = (v) => (typeof v === "string" && v.length > 0 && v.length <= 80 ? cleanText(v, 80) : newId());

function normBullets(v, max) {
  return arr(v, LIMITS.bullets).map((b) => ({ id: id(b?.id), text: cleanText(isObj(b) ? b.text : b, max) }));
}

function normTags(v) {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  return list.map((t) => cleanText(t, 80).trim()).filter(Boolean).slice(0, LIMITS.tags);
}

function normItem(type, raw) {
  const src = isObj(raw) ? raw : {};
  const item = { id: id(src.id) };
  for (const f of SECTION_DEFS[type].fields) {
    const value = src[f.key];
    if (f.type === "checkbox") item[f.key] = value === true;
    else if (f.type === "bullets") item[f.key] = normBullets(value, f.max);
    else if (f.type === "tags") item[f.key] = normTags(value);
    else item[f.key] = cleanText(value, f.max || 200, { multiline: f.type === "textarea" });
  }
  return item;
}

/** Photo is stored as a small JPEG data URL produced by our own canvas re-encode. */
export function normalizePhoto(p) {
  if (!isObj(p) || typeof p.data !== "string") return null;
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.data) || p.data.length > PHOTO_MAX_CHARS) return null;
  return { data: p.data, width: Math.min(2000, Math.max(1, Math.round(Number(p.width) || 320))), height: Math.min(2000, Math.max(1, Math.round(Number(p.height) || 320))) };
}

/** Validates and repairs a stored/imported record. Throws ResumeDataError when unusable. */
export function normalizeResume(raw) {
  if (!isObj(raw) || typeof raw.id !== "string" || !raw.id) {
    throw new ResumeDataError("invalid", "Not a CareerCanvas resume.");
  }
  const version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new ResumeDataError("newer-version", "This document was created by a newer version of CareerCanvas.");
  }

  const stamp = nowIso();
  const doc = createBlank();
  doc.id = id(raw.id);
  doc.title = cleanText(raw.title, 120) || "Untitled resume";
  doc.createdAt = iso(raw.createdAt, stamp);
  doc.updatedAt = iso(raw.updatedAt, doc.createdAt);
  doc.templateId = TEMPLATE_IDS.includes(raw.templateId) ? raw.templateId : DEFAULT_TEMPLATE_ID;
  doc.pageSize = PAGE_SIZES.includes(raw.pageSize) ? raw.pageSize : "A4";
  doc.designSettings = normalizeDesign(raw.designSettings);
  doc.photo = normalizePhoto(raw.photo);
  doc.metadata = {
    isSample: raw.metadata?.isSample === true,
    createdWith: cleanText(raw.metadata?.createdWith, 20) || APP_VERSION,
  };

  const contact = isObj(raw.contact) ? raw.contact : {};
  for (const f of CONTACT_FIELDS) doc.contact[f.key] = cleanText(contact[f.key], f.max);

  doc.links = arr(raw.links, LIMITS.links).map((l) => ({
    id: id(l?.id),
    label: cleanText(l?.label, 60),
    url: cleanText(l?.url, 300),
  }));

  const rawSections = isObj(raw.sections) ? raw.sections : {};
  for (const type of BUILTIN_ORDER) {
    const src = isObj(rawSections[type]) ? rawSections[type] : {};
    const def = SECTION_DEFS[type];
    const section = { id: type, type, visible: src.visible !== false };
    if (def.kind === "text") section.text = cleanText(src.text, def.max, { multiline: true });
    else section.items = arr(src.items, LIMITS.entries).map((it) => normItem(type, it));
    doc.sections[type] = section;
  }

  const customs = Object.values(rawSections)
    .filter((s) => isObj(s) && s.type === "custom")
    .slice(0, LIMITS.customSections);
  for (const s of customs) {
    const sid = id(s.id);
    if (doc.sections[sid]) continue;
    doc.sections[sid] = {
      id: sid,
      type: "custom",
      visible: s.visible !== false,
      title: cleanText(s.title, 80) || "Custom section",
      mode: s.mode === "bullets" ? "bullets" : "text",
      text: cleanText(s.text, 3000, { multiline: true }),
      bullets: normBullets(s.bullets, 400),
    };
  }

  // Keep the stored order, drop unknown ids, append anything missing.
  const seen = new Set();
  const order = [];
  for (const sid of arr(raw.sectionOrder, 100)) {
    if (typeof sid === "string" && doc.sections[sid] && !seen.has(sid)) {
      seen.add(sid);
      order.push(sid);
    }
  }
  for (const sid of Object.keys(doc.sections)) if (!seen.has(sid)) order.push(sid);
  doc.sectionOrder = order;

  doc.schemaVersion = SCHEMA_VERSION;
  return doc;
}
