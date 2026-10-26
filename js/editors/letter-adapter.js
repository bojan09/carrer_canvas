import { h } from "../utils/dom.js";
import { cleanText } from "../utils/sanitization.js";
import { LETTER_FIELD_MAX as MAX, LETTER_LIMITS, copyDetailsFromResume, createLetterSample, emptyParagraph, todayIso } from "../models/cover-letter.js";
import { getRepository } from "../storage/repository.js";
import { openDialog } from "../components/dialog.js";
import { toast } from "../components/toast.js";
import { iconButton, textField } from "./fields.js";
import { contactBody } from "./section-forms.js";
import { LETTER_PROMPTS, analyzeLetter, openLetterIssues } from "./letter-hints.js";

/** Cover-letter counterpart of resume-adapter.js: the accordion cards and checklist for a letter. */

let sampleDoc = null;
const fmt = (iso) => new Date(iso).toLocaleDateString([], { dateStyle: "medium" });

/** Asks which resume to copy from, shows exactly what is copied, and only then copies. */
export async function chooseResume() {
  const repo = await getRepository();
  const { items } = await repo.list();
  const resumes = items.filter((d) => d.kind !== "cover-letter");
  if (!resumes.length) {
    await openDialog({ title: "No resumes to copy from", body: "There are no saved resumes on this device yet. Create a resume first, or type your details in directly.", actions: [{ label: "Close", value: true, variant: "primary" }] });
    return null;
  }
  const name = "copy-resume";
  const list = h(
    "fieldset",
    { class: "mode" },
    h("legend", { class: "field__label", text: "Copy details from" }),
    ...resumes.map((r, i) => {
      const input = h("input", { type: "radio", name, value: r.id, class: "check__input" });
      input.checked = i === 0;
      return h("label", { class: "check restore__option" }, input, h("span", {}, h("strong", { text: r.title }), h("small", { text: `${r.contact.fullName || "No name"} · edited ${fmt(r.updatedAt)}` })));
    }),
  );
  const photo = h("input", { type: "checkbox", class: "check__input", id: "copy-photo" });
  const body = h(
    "div",
    {},
    h("p", { text: "This copies your name, professional title, contact details, links, signature name and template look into this letter. It also copies the photo if you tick the box. The resume itself is never changed, and the two stay separate afterwards." }),
    h("p", { class: "notice notice--warn" }, h("span", { text: "It replaces the details currently in this letter. You can undo it." })),
    list,
    resumes.some((r) => r.photo) ? h("label", { class: "check", for: "copy-photo" }, photo, h("span", { text: "Also copy the photo" })) : null,
  );
  const picked = await openDialog({
    title: "Copy details from a resume",
    body,
    actions: [
      { label: "Cancel", value: null, variant: "outline" },
      { label: "Copy details", value: () => ({ id: body.querySelector(`input[name="${name}"]:checked`)?.value, includePhoto: photo.checked }), variant: "primary" },
    ],
  });
  if (!picked?.id) return null;
  const resume = resumes.find((r) => r.id === picked.id);
  return resume ? { resume, includePhoto: picked.includePhoto } : null;
}

function contactCard(doc, ctx) {
  return (body) => {
    const copy = iconButton({
      name: "copy",
      text: "Copy details from a resume…",
      label: "Copy details from a resume",
      variant: "outline",
      focusKey: "letter:copy",
      onClick: async () => {
        let choice;
        try {
          choice = await chooseResume();
        } catch {
          return toast({ message: "Could not read your saved resumes.", tone: "warn" });
        }
        if (!choice) return;
        ctx.change(() => copyDetailsFromResume(doc, choice.resume, { includePhoto: choice.includePhoto }), { structural: true, focusKey: "letter:copy", expand: "contact" });
        ctx.undoable("Details copied from your resume.");
      },
    });
    body.append(h("div", { class: "sec__tools" }, copy), contactBody(doc, ctx));
  };
}

function field(doc, ctx, { label, get, set, max, hint, type = "text", rows, key, full = true, placeholder, autocomplete }) {
  const f = textField({ label, value: get(), type, rows, max, hint, full, placeholder, autocomplete, onInput: (v) => ctx.change(() => set(cleanText(v, max, { multiline: type === "textarea" })), { group: `letter.${key}` }) });
  f.input.dataset.focusKey = `letter:${key}`;
  return f;
}

function recipientCard(doc, ctx) {
  return (body) => {
    const r = doc.recipient;
    const date = textField({ label: "Date", value: doc.date, type: "date", max: 10, hint: "Optional. Leave it empty to leave the date off the letter.", full: false, onInput: (v) => ctx.change(() => (doc.date = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""), { group: "letter.date" }) });
    date.input.dataset.focusKey = "letter:date";
    const today = iconButton({
      name: "calendar",
      text: "Use today's date",
      label: "Use today's date",
      variant: "ghost",
      onClick: () => ctx.change(() => (doc.date = todayIso()), { structural: true, focusKey: "letter:date", expand: "recipient" }),
    });
    body.append(
      h(
        "div",
        { class: "fields" },
        field(doc, ctx, { label: "Recipient name", get: () => r.name, set: (v) => (r.name = v), max: MAX.name, key: "r.name", full: false, hint: "Optional. Use a name you have found yourself, for example in the job post.", autocomplete: "off" }).root,
        field(doc, ctx, { label: "Recipient title", get: () => r.title, set: (v) => (r.title = v), max: MAX.title, key: "r.title", full: false, placeholder: "e.g. Hiring Manager" }).root,
        field(doc, ctx, { label: "Company or organisation", get: () => r.company, set: (v) => (r.company = v), max: MAX.company, key: "r.company", full: false }).root,
        field(doc, ctx, { label: "Role you are applying for", get: () => doc.role, set: (v) => (doc.role = v), max: MAX.role, key: "role", full: false, hint: "Shown as the subject line (“Re: …”). Clear it to hide the line." }).root,
        field(doc, ctx, { label: "Address", get: () => r.address, set: (v) => (r.address = v), max: MAX.address, key: "r.address", type: "textarea", rows: 3, hint: "Optional. One line per row." }).root,
        date.root,
        h("div", { class: "field" }, today),
      ),
    );
  };
}

function openingCard(doc, ctx) {
  return (body) => {
    body.append(
      h("p", { class: "field__hint", text: "The prompts below only suggest what each part can cover. CareerCanvas does not write your letter or look anything up about a company. Every word, and every claim, is yours." }),
      h(
        "div",
        { class: "fields" },
        field(doc, ctx, { label: "Greeting", get: () => doc.greeting, set: (v) => (doc.greeting = v), max: MAX.greeting, key: "greeting", hint: LETTER_PROMPTS.greeting, placeholder: "Dear …," }).root,
        field(doc, ctx, { label: "Opening paragraph", get: () => doc.opening, set: (v) => (doc.opening = v), max: MAX.opening, key: "opening", type: "textarea", rows: 5, hint: LETTER_PROMPTS.opening }).root,
      ),
    );
  };
}

function bodyCard(doc, ctx) {
  return (body) => {
    const list = h("div", { class: "fields" });
    doc.body.forEach((p, i) => {
      const f = field(doc, ctx, { label: `Body paragraph ${i + 1}`, get: () => p.text, set: (v) => (p.text = v), max: MAX.paragraph, key: `p.${p.id}`, type: "textarea", rows: 8, hint: LETTER_PROMPTS.body[i] });
      const tools = h(
        "div",
        { class: "field__tools" },
        iconButton({ name: "arrow-up", label: `Move paragraph ${i + 1} up`, disabled: i === 0, focusKey: `letter:p.${p.id}:up`, onClick: () => ctx.change(() => doc.body.splice(i - 1, 0, doc.body.splice(i, 1)[0]), { structural: true, focusKey: `letter:p.${p.id}:${i === 1 ? "down" : "up"}` }) }),
        iconButton({ name: "arrow-down", label: `Move paragraph ${i + 1} down`, disabled: i === doc.body.length - 1, focusKey: `letter:p.${p.id}:down`, onClick: () => ctx.change(() => doc.body.splice(i + 1, 0, doc.body.splice(i, 1)[0]), { structural: true, focusKey: `letter:p.${p.id}:${i === doc.body.length - 2 ? "up" : "down"}` }) }),
        iconButton({
          name: "trash",
          label: `Remove paragraph ${i + 1}`,
          disabled: doc.body.length <= 1,
          onClick: () => {
            ctx.change(() => doc.body.splice(i, 1), { structural: true, focusKey: "letter:add" });
            ctx.undoable("Paragraph removed.");
          },
        }),
      );
      f.root.append(tools);
      f.root.dataset.flipKey = `para:${p.id}`;
      list.append(f.root);
    });
    body.append(list);
    if (doc.body.length < LETTER_LIMITS.bodyParagraphs) {
      body.append(
        iconButton({
          name: "plus",
          text: "Add paragraph",
          label: "Add paragraph",
          variant: "outline",
          focusKey: "letter:add",
          onClick: () => {
            const p = emptyParagraph();
            ctx.change(() => doc.body.push(p), { structural: true, focusKey: `letter:p.${p.id}`, expand: "body" });
          },
        }),
      );
    } else body.append(h("p", { class: "field__hint", text: "Three body paragraphs is the maximum. Short letters are usually easier to read." }));
  };
}

function closingCard(doc, ctx) {
  return (body) => {
    const sig = field(doc, ctx, { label: "Signature name", get: () => doc.signature, set: (v) => (doc.signature = v), max: MAX.signature, key: "signature", full: false });
    const useName = iconButton({
      name: "user",
      text: "Use my name",
      label: "Use my name from Your details",
      variant: "ghost",
      disabled: !doc.contact.fullName.trim(),
      onClick: () => ctx.change(() => (doc.signature = doc.contact.fullName), { structural: true, focusKey: "letter:signature", expand: "closing" }),
    });
    body.append(
      h(
        "div",
        { class: "fields" },
        field(doc, ctx, { label: "Closing", get: () => doc.closing, set: (v) => (doc.closing = v), max: MAX.closing, key: "closing", full: false, hint: LETTER_PROMPTS.closing, placeholder: "e.g. Sincerely," }).root,
        sig.root,
        h("div", { class: "field" }, useName),
      ),
    );
  };
}

export const letterAdapter = {
  kind: "letter",
  noun: "cover letter",
  untitled: "Untitled cover letter",
  hasRail: false,
  analyze: analyzeLetter,
  openIssues: openLetterIssues,
  sample: () => (sampleDoc ||= createLetterSample()),

  cards(session, ctx) {
    const doc = session.doc;
    const words = (n) => `${n} ${n === 1 ? "paragraph" : "paragraphs"}`;
    return [
      { id: "contact", label: "Your details", iconName: "user", fill: contactCard(doc, ctx) },
      { id: "recipient", label: "Recipient and role", iconName: "briefcase", meta: doc.recipient.company, fill: recipientCard(doc, ctx) },
      { id: "opening", label: "Greeting and opening", iconName: "mail", fill: openingCard(doc, ctx) },
      { id: "body", label: "Body", iconName: "file-text", meta: words(doc.body.filter((p) => p.text.trim()).length), fill: bodyCard(doc, ctx) },
      { id: "closing", label: "Closing and signature", iconName: "pencil", fill: closingCard(doc, ctx) },
    ];
  },
};
