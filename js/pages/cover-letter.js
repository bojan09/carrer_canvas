import { getSettings } from "../state/settings.js";
import { h, icon } from "../utils/dom.js";
import { getRepository } from "../storage/repository.js";
import { closeSession, openSession, settleSaves } from "../state/resume-store.js";
import { copyDetailsFromResume, createBlankLetter, createLetterSample } from "../models/cover-letter.js";
import { mountStudio } from "../editors/studio.js";
import { letterAdapter, chooseResume } from "../editors/letter-adapter.js";
import { toast } from "../components/toast.js";

async function createAndOpen(doc) {
  try {
    const repo = await getRepository();
    await repo.put(doc);
    await repo.setLastLetterId(doc.id);
    location.hash = `#/cover-letter/${doc.id}`;
  } catch (err) {
    toast({ message: err?.name === "QuotaExceededError" ? "Not enough storage space to create a new cover letter." : "Could not create the cover letter. Storage may be unavailable.", tone: "warn", duration: 8000 });
  }
}

function message(root, { title, lead, actions }) {
  root.replaceChildren(
    h("div", { class: "container page" }, h("section", { class: "empty" }, h("h1", { class: "empty__title", tabindex: "-1", text: title }), h("p", { class: "empty__lead", text: lead }), h("div", { class: "empty__actions" }, actions))),
  );
}

const savedLink = () => h("a", { class: "btn btn--primary", href: "#/saved", text: "Go to saved documents" });

function editorPage(root, id) {
  let disposed = false;
  let cleanup = null;
  root.replaceChildren(h("p", { class: "page-loading container", role: "status", text: "Opening your cover letter…" }));

  (async () => {
    try {
      const session = await openSession(id);
      if (disposed) return closeSession();
      if (session && session.doc.kind !== "cover-letter") {
        await closeSession();
        return location.replace(`#/resume/${id}`);
      }
      if (!session) return message(root, { title: "Cover letter not found", lead: "This cover letter does not exist on this device. It may have been deleted, or it was created in another browser.", actions: [savedLink()] });
      const repo = await getRepository();
      cleanup = mountStudio(root, session, { persistent: repo.persistent, adapter: letterAdapter });
    } catch (err) {
      if (disposed) return;
      message(root, {
        title: err?.code === "newer-version" ? "Created by a newer version" : "This cover letter could not be opened",
        lead: err?.code === "newer-version" ? "This document was saved by a newer version of CareerCanvas. Update the app (reload the page) before opening it. It has not been changed." : "The stored data is unreadable. It has not been modified or deleted.",
        actions: [savedLink()],
      });
    }
  })();

  return () => {
    disposed = true;
    cleanup?.();
    closeSession();
  };
}

async function fromResume() {
  const choice = await chooseResume();
  if (!choice) return;
  const doc = createBlankLetter("Untitled cover letter", getSettings().pageSize);
  copyDetailsFromResume(doc, choice.resume, { includePhoto: choice.includePhoto });
  await createAndOpen(doc);
}

function startPage(root) {
  let disposed = false;
  root.replaceChildren(h("p", { class: "page-loading container", role: "status", text: "Loading…" }));

  (async () => {
    await settleSaves();
    const repo = await getRepository();
    const last = await repo.getLastLetterId().catch(() => null);
    if (last) {
      const exists = await repo.get(last).catch(() => null);
      if (disposed) return;
      if (exists?.kind === "cover-letter") return location.replace(`#/cover-letter/${last}`);
    }
    const { items } = await repo.list();
    if (disposed) return;
    const letters = items.filter((d) => d.kind === "cover-letter");

    const card = (iconName, title, text, label, onClick, primary) => {
      const btn = h("button", { type: "button", class: `btn btn--${primary ? "primary" : "outline"}`, text: label, onclick: onClick });
      const art = h("span", { class: "trust-card__icon" });
      art.innerHTML = icon(iconName);
      return h("article", { class: "trust-card" }, art, h("h3", { text: title }), h("p", { text }), h("div", { class: "start__action" }, btn));
    };

    root.replaceChildren(
      h(
        "div",
        { class: "container page" },
        h("header", { class: "page-head" }, h("h1", { class: "page-head__title", tabindex: "-1", text: "Start your cover letter" }), h("p", { class: "page-head__lead", text: "Write a letter that matches your resume's look. It is saved only on this device, and CareerCanvas never writes or invents any of it for you." })),
        !repo.persistent ? h("p", { class: "notice notice--warn", text: "Storage is unavailable in this browser, so letters last only until you close this tab." }) : null,
        h(
          "div",
          { class: "trust-grid" },
          card("mail", "Blank letter", "Start from an empty structure. You do not need a resume.", "Start blank", () => createAndOpen(createBlankLetter("Untitled cover letter", getSettings().pageSize)), true),
          card("file-text", "From a resume", "Copy your name and contact details from a saved resume. You choose what is copied and the resume is never changed.", "Choose a resume", () => fromResume(), false),
          card("layers", "Fictional sample", "Explore the editor with clearly marked placeholder content. Replace it before real use.", "Open sample", () => createAndOpen(createLetterSample(getSettings().pageSize)), false),
          letters.length ? card("folder", "Saved letters", `You have ${letters.length} saved on this device.`, "View saved", () => (location.hash = "#/saved"), false) : null,
        ),
      ),
    );
  })();

  return () => {
    disposed = true;
  };
}

export default function coverLetter(root, { params }) {
  return params?.id ? editorPage(root, params.id) : startPage(root);
}
