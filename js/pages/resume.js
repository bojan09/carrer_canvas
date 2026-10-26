import { getSettings } from "../state/settings.js";
import { h, icon } from "../utils/dom.js";
import { getRepository } from "../storage/repository.js";
import { closeSession, openSession, settleSaves } from "../state/resume-store.js";
import { createBlank, createSample } from "../models/resume.js";
import { mountStudio } from "../editors/studio.js";
import { toast } from "../components/toast.js";
import { studioSkeleton, whenSlow } from "../components/skeleton.js";

async function createAndOpen(doc) {
  try {
    const repo = await getRepository();
    await repo.put(doc);
    await repo.setLastResumeId(doc.id);
    location.hash = `#/resume/${doc.id}`;
  } catch (err) {
    toast({ message: err?.name === "QuotaExceededError" ? "Not enough storage space to create a new resume." : "Could not create the resume. Storage may be unavailable.", tone: "warn", duration: 8000 });
  }
}

function message(root, { title, lead, actions }) {
  root.replaceChildren(
    h(
      "div",
      { class: "container page" },
      h("section", { class: "empty" }, h("h1", { class: "empty__title", tabindex: "-1", text: title }), h("p", { class: "empty__lead", text: lead }), h("div", { class: "empty__actions" }, actions)),
    ),
  );
}

const savedLink = () => h("a", { class: "btn btn--primary", href: "#/saved", text: "Go to saved documents" });

function editorPage(root, id) {
  let disposed = false;
  let cleanup = null;
  let ready = false;
  root.replaceChildren(h("p", { class: "page-loading container", role: "status", text: "Opening your resume…" }));
  const cancelSkeleton = whenSlow(root, studioSkeleton, () => ready || disposed);

  (async () => {
    try {
      const session = await openSession(id);
      if (disposed) return closeSession();
      if (session?.doc.kind === "cover-letter") {
        await closeSession();
        return location.replace(`#/cover-letter/${id}`);
      }
      if (!session) return message(root, { title: "Resume not found", lead: "This resume does not exist on this device. It may have been deleted, or it was created in another browser.", actions: [savedLink()] });
      const repo = await getRepository();
      ready = true;
      cleanup = mountStudio(root, session, { persistent: repo.persistent });
    } catch (err) {
      if (disposed) return;
      message(root, {
        title: err?.code === "newer-version" ? "Created by a newer version" : "This resume could not be opened",
        lead:
          err?.code === "newer-version"
            ? "This document was saved by a newer version of CareerCanvas. Update the app (reload the page) before opening it. It has not been changed."
            : "The stored data is unreadable. It has not been modified or deleted.",
        actions: [savedLink()],
      });
    }
  })();

  return () => {
    disposed = true;
    cancelSkeleton();
    cleanup?.();
    closeSession();
  };
}

function startPage(root) {
  let disposed = false;
  root.replaceChildren(h("p", { class: "page-loading container", role: "status", text: "Loading…" }));

  (async () => {
    await settleSaves();
    const repo = await getRepository();
    const last = await repo.getLastResumeId().catch(() => null);
    if (last) {
      const exists = await repo.get(last).catch(() => null);
      if (disposed) return;
      if (exists) return location.replace(`#/resume/${last}`);
    }
    const { items } = await repo.list();
    if (disposed) return;

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
        h("header", { class: "page-head" }, h("h1", { class: "page-head__title", tabindex: "-1", text: "Start your resume" }), h("p", { class: "page-head__lead", text: "Everything you write is saved only on this device. Nothing is generated or filled in for you." })),
        !repo.persistent ? h("p", { class: "notice notice--warn", text: "Storage is unavailable in this browser, so resumes last only until you close this tab." }) : null,
        h(
          "div",
          { class: "trust-grid" },
          card("file-text", "Blank resume", "Start from an empty structure and fill in your own details.", "Start blank", () => createAndOpen(createBlank("Untitled resume", getSettings().pageSize)), true),
          card("layers", "Fictional sample", "Explore the editor with clearly marked placeholder content. Replace it before real use.", "Open sample", () => createAndOpen(createSample(getSettings().pageSize)), false),
          items.length ? card("folder", "Saved resumes", `You have ${items.length} saved on this device.`, "View saved", () => (location.hash = "#/saved"), false) : null,
        ),
      ),
    );
  })();

  return () => {
    disposed = true;
  };
}

export default function resume(root, { params }) {
  return params?.id ? editorPage(root, params.id) : startPage(root);
}
