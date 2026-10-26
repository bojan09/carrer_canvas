import { getTemplate } from "./registry.js";

/** Design settings are stored as OVERRIDES on top of each template's defaults.
 *  Everything is clamped here so stored/imported values can never break the layout. */

export const FONT_PAIRS = {
  clean: { label: "Clean Sans", head: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  editorial: { label: "Editorial", head: 'Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif', body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  classic: { label: "Classic Serif", head: 'Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif', body: 'Charter, "Bitstream Charter", "Iowan Old Style", Georgia, "Times New Roman", serif' },
  humanist: { label: "Humanist", head: '"Gill Sans", "Gill Sans MT", Optima, Candara, "Segoe UI", "Trebuchet MS", sans-serif', body: '"Gill Sans", "Gill Sans MT", Optima, Candara, "Segoe UI", "Trebuchet MS", sans-serif' },
};

export const DIVIDERS = ["none", "line", "thick", "dotted"];
export const ALIGNS = ["left", "center"];

export const LIMITS = {
  titleScale: { min: 0.85, max: 1.5, step: 0.05, label: "Name size" },
  bodyScale: { min: 0.85, max: 1.2, step: 0.01, label: "Text size" },
  lineHeight: { min: 1.2, max: 1.8, step: 0.05, label: "Line spacing" },
  sectionGap: { min: 8, max: 40, step: 1, label: "Section spacing" },
  margins: { min: 10, max: 30, step: 1, label: "Page margins" },
};

/** Transparency controls (0 = fully transparent, 1 = the template's own look). */
export const OPACITY_LIMITS = {
  fillOpacity: { min: 0, max: 1, step: 0.05, label: "Background decoration" },
  photoOpacity: { min: 0.2, max: 1, step: 0.05, label: "Photo" },
};

// ---------- per-element formatting ----------
/** The kinds of text a user can format separately. Every element of a kind is formatted together, so the
 *  document stays consistent. The renderer tags elements with data-role; css/templates/elements.css applies them. */
export const ELEMENT_ROLES = {
  name: { label: "Name", hint: "Your name at the top", align: true },
  role: { label: "Job title line", hint: "The line under your name", align: true },
  contact: { label: "Contact details", hint: "Email, phone, location and links", align: true },
  heading: { label: "Section headings", hint: "Experience, Education and so on" },
  title: { label: "Entry titles", hint: "Job titles, schools, projects" },
  body: { label: "Body text", hint: "Summaries, bullets and skills", align: true, justify: true },
  meta: { label: "Dates and details", hint: "Dates, companies, locations" },
};

export const WEIGHTS = [
  [400, "Regular"],
  [500, "Medium"],
  [600, "Semibold"],
  [700, "Bold"],
  [800, "Extra bold"],
  [900, "Black"],
];

const SYS_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYS_SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif';
const SYS_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Bundled open-licence fonts (css/fonts.css) plus system stacks. Non-Latin text falls back to the system font. */
export const FONT_FAMILIES = {
  inter: { label: "Inter", group: "Sans-serif", stack: `"Inter Variable", ${SYS_SANS}` },
  "dm-sans": { label: "DM Sans", group: "Sans-serif", stack: `"DM Sans Variable", ${SYS_SANS}` },
  "space-grotesk": { label: "Space Grotesk", group: "Sans-serif", stack: `"Space Grotesk Variable", ${SYS_SANS}` },
  "system-sans": { label: "System sans", group: "Sans-serif", stack: SYS_SANS },
  lora: { label: "Lora", group: "Serif", stack: `"Lora Variable", ${SYS_SERIF}` },
  playfair: { label: "Playfair Display", group: "Serif", stack: `"Playfair Display Variable", ${SYS_SERIF}` },
  "source-serif": { label: "Source Serif", group: "Serif", stack: `"Source Serif 4 Variable", ${SYS_SERIF}` },
  "system-serif": { label: "System serif", group: "Serif", stack: SYS_SERIF },
  jetbrains: { label: "JetBrains Mono", group: "Monospace", stack: `"JetBrains Mono Variable", ${SYS_MONO}` },
  "system-mono": { label: "System mono", group: "Monospace", stack: SYS_MONO },
};

export const ELEMENT_LIMITS = {
  size: { min: 6, max: 72, step: 0.5, label: "Size" },
  track: { min: -0.05, max: 0.4, step: 0.01, label: "Letter spacing" },
};
export const PHOTO_LIMITS = {
  photoSize: { min: 15, max: 70, step: 1, label: "Photo size" },
  photoX: { min: -30, max: 30, step: 1, label: "Nudge photo sideways" },
  photoY: { min: -30, max: 30, step: 1, label: "Nudge photo up or down" },
};

/** Keeps only valid per-element settings. */
export function normalizeElements(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const role of Object.keys(ELEMENT_ROLES)) {
    const src = raw[role];
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const el = {};
    if (typeof src.color === "string" && HEX.test(src.color)) el.color = src.color.toLowerCase();
    if (typeof src.font === "string" && FONT_FAMILIES[src.font]) el.font = src.font;
    if (WEIGHTS.some(([w]) => w === src.weight)) el.weight = src.weight;
    for (const key of Object.keys(ELEMENT_LIMITS)) {
      const n = Number(src[key]);
      if (src[key] !== undefined && src[key] !== null && src[key] !== "" && Number.isFinite(n)) el[key] = Math.round(clamp(n, ELEMENT_LIMITS[key].min, ELEMENT_LIMITS[key].max) * 100) / 100;
    }
    if (typeof src.italic === "boolean") el.italic = src.italic;
    if (typeof src.upper === "boolean") el.upper = src.upper;
    const spec = ELEMENT_ROLES[role];
    if (spec.align && (["left", "center", "right"].includes(src.align) || (spec.justify && src.align === "justify"))) el.align = src.align;
    if (Object.keys(el).length) out[role] = el;
  }
  return out;
}

export const ACCENT_SWATCHES = ["#1f2a44", "#1f64e0", "#3f55e6", "#6d3fd6", "#c0397b", "#d63b25", "#c9791a", "#2a8a64", "#55733f", "#111111"];

export const PAPER = { A4: { w: 794, h: 1123, label: "A4 (210 × 297 mm)" }, Letter: { w: 816, h: 1056, label: "US Letter (8.5 × 11 in)" } };
export const MM = 96 / 25.4;
export const BASE_FONT_PX = 14; // ≈ 10.5pt at 100% text size

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const HEX = /^#[0-9a-f]{6}$/i;

/** Keeps only valid override keys with clamped values. */
export function normalizeDesign(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  if (typeof src.accent === "string" && HEX.test(src.accent)) out.accent = src.accent.toLowerCase();
  if (typeof src.fontPair === "string" && FONT_PAIRS[src.fontPair]) out.fontPair = src.fontPair;
  for (const key of Object.keys(LIMITS)) {
    const n = Number(src[key]);
    if (src[key] !== undefined && Number.isFinite(n)) out[key] = clamp(n, LIMITS[key].min, LIMITS[key].max);
  }
  for (const key of ["textColor", "mutedColor", "fillColor"]) if (typeof src[key] === "string" && HEX.test(src[key])) out[key] = src[key].toLowerCase();
  for (const key of Object.keys(OPACITY_LIMITS)) {
    const n = Number(src[key]);
    if (src[key] !== undefined && src[key] !== null && Number.isFinite(n)) out[key] = Math.round(clamp(n, OPACITY_LIMITS[key].min, OPACITY_LIMITS[key].max) * 100) / 100;
  }
  for (const key of Object.keys(PHOTO_LIMITS)) {
    const n = Number(src[key]);
    if (src[key] !== undefined && src[key] !== null && src[key] !== "" && Number.isFinite(n)) out[key] = Math.round(clamp(n, PHOTO_LIMITS[key].min, PHOTO_LIMITS[key].max));
  }
  const elements = normalizeElements(src.elements);
  if (Object.keys(elements).length) out.elements = elements;
  if (src.mirror === true) out.mirror = true;
  if (src.dateAlign === "right") out.dateAlign = "right";
  if (DIVIDERS.includes(src.dividerStyle)) out.dividerStyle = src.dividerStyle;
  if (ALIGNS.includes(src.headerAlign)) out.headerAlign = src.headerAlign;
  if (src.simplified === true) out.simplified = true;
  if (src.showPhoto === true) out.showPhoto = true;
  if (src.photoShape === "square" || src.photoShape === "circle") out.photoShape = src.photoShape;
  return out;
}

/** Template defaults + user overrides, ready for rendering. */
export function resolveDesign(doc) {
  const tpl = getTemplate(doc.templateId);
  const o = normalizeDesign(doc.designSettings);
  const d = { ...tpl.defaults, ...o };
  d.simplified = Boolean(o.simplified) && !tpl.atsConscious;
  d.showPhoto = Boolean(o.showPhoto);
  d.photoShape = o.photoShape || "circle";
  d.fillOpacity = o.fillOpacity ?? 1;
  d.photoOpacity = o.photoOpacity ?? 1;
  d.mirror = o.mirror === true;
  d.elements = o.elements || {};
  for (const k of Object.keys(PHOTO_LIMITS)) d[k] = o[k];
  d.dateAlign = o.dateAlign === "right" ? "right" : "left";
  if (!tpl.supports.headerAlign) d.headerAlign = tpl.defaults.headerAlign;
  return d;
}

/** Template actually drawn: simplified mode borrows Summit's single-column structure. */
export function renderTemplateOf(doc) {
  const tpl = getTemplate(doc.templateId);
  const d = resolveDesign(doc);
  return d.simplified ? getTemplate("summit") : tpl;
}

export function photoVisible(doc) {
  const d = resolveDesign(doc);
  return Boolean(doc.photo) && d.showPhoto && !d.simplified && renderTemplateOf(doc).supports.photo;
}

/** Switching template keeps content and layout-independent choices, and drops visual overrides. */
export function applyTemplate(doc, templateId) {
  const keep = normalizeDesign(doc.designSettings);
  const dropped = Object.keys(keep).filter((k) => !["simplified", "showPhoto", "photoShape"].includes(k)).length;
  doc.templateId = getTemplate(templateId).id;
  doc.designSettings = {};
  for (const k of ["simplified", "showPhoto", "photoShape"]) if (keep[k] !== undefined) doc.designSettings[k] = keep[k];
  return { dropped };
}

// ---------- contrast ----------
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ---------- text colour that stays readable on a header fill ----------
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

/** `fraction` of `a` plus the rest of `b`. */
export function mixHex(a, b, fraction) {
  const [x, y] = [toRgb(a), toRgb(b)];
  return toHex(x.map((c, i) => c * fraction + y[i] * (1 - fraction)));
}

/** The solid colour a template's header/panel fill effectively has, so text on it can be checked. */
export function effectiveFill(tpl, design) {
  const base = design.fillColor || tpl.fillDefault || design.accent;
  return tpl.id === "prism" ? mixHex(base, "#0b1020", 0.68) : base;
}

/** White or near-black, whichever reads better on `fill` shown at `opacity` over `paper`. */
export function readableInk(fill, opacity, paper) {
  const shown = mixHex(fill, paper, opacity);
  return contrastRatio("#ffffff", shown) >= contrastRatio("#111111", shown) ? "#ffffff" : "#111111";
}
