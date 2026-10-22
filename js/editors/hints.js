import { CONTACT_FIELDS, SECTION_DEFS } from "../models/section-defs.js";
import { validateField, validateRange } from "../utils/validation.js";

/** Local, non-AI writing checklist. Advice only: no scores, no ATS claims, no invented content.
 *  @returns {{id:string, ok:boolean, label:string, detail?:string, section?:string}[]} */
export function analyze(doc) {
  const out = [];
  const add = (id, ok, label, detail, section) => out.push({ id, ok, label, detail, section });
  const visible = doc.sectionOrder.map((id) => doc.sections[id]).filter((s) => s.visible);

  // Contact
  add("name", Boolean(doc.contact.fullName.trim()), "Your name is present", "Add your full name.", "contact");
  const emailErr = validateField({ validate: "email" }, doc.contact.email);
  add("email", Boolean(doc.contact.email.trim()) && !emailErr, "A valid email address is present", emailErr || "Add an email address employers can reach.", "contact");
  const badContact = CONTACT_FIELDS.filter((f) => f.validate && f.key !== "email" && validateField(f, doc.contact[f.key]));
  add("contact-format", badContact.length === 0, "Phone and web addresses look valid", badContact.map((f) => f.label).join(", ") + " need attention.", "contact");

  // Sample content
  if (doc.metadata.isSample) {
    add("sample", false, "Sample content is still present", "This resume contains fictional sample text. Replace it with your own before using it.", "contact");
  }

  // Empty visible sections
  const empty = visible.filter((s) => isEmpty(s));
  add("empty", empty.length === 0, "No empty sections are shown", empty.map((s) => titleOf(s)).join(", ") + " are shown but empty. Add content or hide them.", empty[0]?.id);

  // Experience quality
  const exp = doc.sections.experience;
  if (exp.visible && exp.items.length) {
    const noBullets = exp.items.filter((i) => !i.bullets.some((b) => b.text.trim()));
    add("exp-bullets", noBullets.length === 0, "Each position lists achievements as bullet points", "Describe what you did, how, and what changed (action + method + impact).", "experience");
    const noDates = exp.items.filter((i) => !i.startDate || (!i.current && !i.endDate));
    add("exp-dates", noDates.length === 0, "Positions have clear start and end dates", "Add a start date and either an end date or “I currently work here”.", "experience");
  }

  // Date problems across sections
  const dateIssues = [];
  for (const type of ["experience", "education", "projects", "certifications"]) {
    const section = doc.sections[type];
    if (!section.visible) continue;
    for (const item of section.items) {
      for (const key of ["startDate", "endDate", "date"]) {
        if (item[key] && validateField({ validate: "month" }, item[key])) dateIssues.push(SECTION_DEFS[type].label);
      }
      if (validateRange(item.startDate, item.endDate, item.current)) dateIssues.push(SECTION_DEFS[type].label);
    }
  }
  add("dates", dateIssues.length === 0, "Dates are valid and consistent", `Check dates in: ${[...new Set(dateIssues)].join(", ")}.`);

  // Link validity
  const badLinks = doc.links.filter((l) => l.url && validateField({ validate: "url" }, l.url)).length;
  add("links", badLinks === 0, "Links are web addresses", `${badLinks} link(s) are not valid web addresses.`, "contact");

  // Writing advice
  const summary = doc.sections.summary;
  if (summary.visible && summary.text) {
    add("summary-length", summary.text.length <= 700, "The summary is concise", "Try two to four sentences. Long summaries are rarely read in full.", "summary");
  }
  const bullets = collectBullets(doc);
  const long = bullets.filter((b) => b.length > 250).length;
  add("bullet-length", long === 0, "Bullets are short enough to scan", `${long} bullet(s) are very long. Consider splitting them.`);
  const seen = new Set();
  let dupes = 0;
  for (const b of bullets) {
    const k = b.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) dupes += 1;
    seen.add(k);
  }
  add("duplicates", dupes === 0, "No repeated bullets", `${dupes} bullet(s) appear more than once.`);

  const chars = bullets.join("").length + (summary.text || "").length;
  add("length", chars < 4500, "Length looks reasonable", "This is a lot of text. Two pages is a common upper guide, though not a rule. Check the preview.");

  return out;
}

const titleOf = (s) => (s.type === "custom" ? s.title || "Custom section" : SECTION_DEFS[s.type].label);

export function isEmpty(section) {
  if (section.type === "summary") return !section.text.trim();
  if (section.type === "custom") return section.mode === "bullets" ? !section.bullets.some((b) => b.text.trim()) : !section.text.trim();
  return section.items.length === 0;
}

function collectBullets(doc) {
  const list = [];
  for (const id of doc.sectionOrder) {
    const s = doc.sections[id];
    if (!s.visible) continue;
    if (s.type === "custom") s.bullets.forEach((b) => list.push(b.text));
    else if (s.items) for (const it of s.items) if (it.bullets) it.bullets.forEach((b) => list.push(b.text));
  }
  return list;
}

export const openIssues = (doc) => analyze(doc).filter((c) => !c.ok).length;
export { titleOf };
