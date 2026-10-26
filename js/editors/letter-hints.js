import { CONTACT_FIELDS } from "../models/section-defs.js";
import { letterText, wordCount } from "../models/cover-letter.js";
import { validateField } from "../utils/validation.js";

/** Structure prompts: what each part of a letter can cover. Tone-independent, never generated text,
 *  and never claims facts about a company. The writer supplies every word. */
export const LETTER_PROMPTS = {
  greeting: "Address a named person when you can find one (the job post or the company's own site often lists a contact). If you cannot, a plain greeting such as “Dear Hiring Team,” is fine.",
  opening: "One or two sentences: the role you are applying for and, if it helps, how you found it. Say what you want, plainly.",
  body: [
    "Why this role and this organisation? Point to something you can verify yourself, such as the job description or their public website. Do not guess at facts about them.",
    "Pick one or two experiences that match what the role asks for. Say what you did, how you did it and what changed. Use only results you can stand behind.",
    "Optional: anything else that helps the reader picture you in the role, such as a relevant project, a skill or when you could start.",
  ],
  closing: "Thank the reader, say what you can offer next (for example sharing more detail), and close simply. Then sign with your name.",
};

export const LETTER_SECTIONS = ["contact", "recipient", "opening", "body", "closing"];

/** Local, non-AI checklist for a letter. Advice only: no scores, no claims about how any employer reads it.
 *  @returns {{id:string, ok:boolean, label:string, detail?:string, section?:string}[]} */
export function analyzeLetter(doc) {
  const out = [];
  const add = (id, ok, label, detail, section) => out.push({ id, ok, label, detail, section });
  const text = letterText(doc);
  const lower = text.toLowerCase();

  add("name", Boolean(doc.contact.fullName.trim()), "Your name is present", "Add your full name in Your details.", "contact");
  const emailErr = validateField({ validate: "email" }, doc.contact.email);
  const reachable = (doc.contact.email.trim() && !emailErr) || doc.contact.phone.trim();
  add("reach", Boolean(reachable), "The reader can reach you", emailErr || "Add an email address or phone number in Your details.", "contact");
  const badContact = CONTACT_FIELDS.filter((f) => f.validate && f.key !== "email" && validateField(f, doc.contact[f.key]));
  add("contact-format", badContact.length === 0, "Phone and web addresses look valid", `${badContact.map((f) => f.label).join(", ")} need attention.`, "contact");

  if (doc.metadata.isSample) add("sample", false, "Sample content is still present", "This letter contains fictional sample text. Replace it with your own before using it.", "opening");

  add("company", Boolean(doc.recipient.company.trim()), "The organisation is named", "Add the company or organisation you are writing to.", "recipient");
  add("role", Boolean(doc.role.trim()), "The role is named", "Add the role you are applying for. It appears as the subject line.", "recipient");
  add("greeting", Boolean(doc.greeting.trim()), "There is a greeting", "Add a greeting such as “Dear …,”.", "opening");
  add("opening", Boolean(doc.opening.trim()), "There is an opening", "Say which role you are applying for and why you are writing.", "opening");
  add("body", doc.body.some((p) => p.text.trim()), "The letter has a body", "Add at least one paragraph about why you fit the role.", "body");
  add("closing", Boolean(doc.closing.trim()) && Boolean(doc.signature.trim()), "There is a closing and signature", "Add a closing such as “Sincerely,” and your name.", "closing");

  const company = doc.recipient.company.trim().toLowerCase();
  if (company && text.trim()) add("mentions", lower.includes(company), "The letter mentions the organisation by name", `Mention ${doc.recipient.company.trim()} in the text so the letter is clearly written for them.`, "body");

  const placeholders = /\[[^\]\n]{1,60}\]|\bxx+\b|lorem ipsum|\bTODO\b/i.test(text);
  add("placeholders", !placeholders, "No placeholders are left", "Look for text in [square brackets], “XX” or “TODO” and replace it.", "body");

  const words = wordCount(text);
  add("length", words <= 400, "Length suits one page", `About ${words} words. Around 250 to 400 words usually fits one page, though it is not a rule. Check the preview.`, "body");
  const longPara = doc.body.some((p) => p.text.length > 1200) || doc.opening.length > 800;
  add("paragraphs", !longPara, "Paragraphs are easy to scan", "One or more paragraphs are very long. Consider splitting them.", "body");
  return out;
}

export const openLetterIssues = (doc) => analyzeLetter(doc).filter((c) => !c.ok).length;
