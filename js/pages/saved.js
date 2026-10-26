import { getSettings } from "../state/settings.js";
import { h, icon } from "../utils/dom.js";
import { getRepository } from "../storage/repository.js";
import { settleSaves } from "../state/resume-store.js";
import { createBlank, createSample, duplicateResume } from "../models/resume.js";
import { createBlankLetter, createLetterSample, duplicateLetter, isLetter } from "../models/cover-letter.js";
import { getTemplate } from "../templates/registry.js";
import { cleanText } from "../utils/sanitization.js";
import { confirmDialog, openDialog } from "../components/dialog.js";
import { toast } from "../components/toast.js";
import { announce } from "../components/announcer.js";
import { backupFlow, lastBackupText, restoreFlow } from "../export/backup-ui.js";
import { docCardsSkeleton, whenSlow } from "../components/skeleton.js";

const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

const noun = (doc) => (isLetter(doc) ? "cover letter" : "resume");
const route = (doc) => (isLetter(doc) ? `#/cover-letter/${doc.id}` : `#/resume/${doc.id}`);
const FILTERS = [
  ["all", "All"],
  ["resume", "Resumes"],
  ["letter", "Cover letters"],
];

export default function saved(root) {
  let disposed = false;
  let filter = "all";
  let loaded = false;
  root.replaceChildren(h("p", { class: "page-loading container", role: "status", text: "Loading your documents…" }));
  const cancelSkeleton = whenSlow(root, docCardsSkeleton, () => loaded || disposed);

  async function load() {
    await settleSaves();
    const repo = await getRepository();
    const { items, unreadable } = await repo.list();
    loaded = true;
    if (!disposed) paint(repo, items, unreadable);
  }

  const fail = (what, err) =>
    toast({
      message: err?.name === "QuotaExceededError" ? "Not enough storage space." : `Could not ${what}. Storage may be unavailable.`,
      tone: "warn",
      duration: 7000,
    });

  async function create(doc) {
    try {
      const repo = await getRepository();
      await repo.put(doc);
      await (isLetter(doc) ? repo.setLastLetterId(doc.id) : repo.setLastResumeId(doc.id));
      location.hash = route(doc);
    } catch (err) {
      fail(`create the ${noun(doc)}`, err);
    }
  }

  async function rename(repo, doc) {
    const input = h("input", { class: "input", id: "rename-input", type: "text", maxlength: "120", value: doc.title });
    const next = await openDialog({
      title: `Rename ${noun(doc)}`,
      body: h("div", { class: "fields" }, h("label", { class: "field__label", for: "rename-input", text: "Name" }), input),
      initialFocus: "#rename-input",
      actions: [
        { label: "Cancel", value: null, variant: "outline" },
        { label: "Rename", value: () => cleanText(input.value, 120).trim() || (isLetter(doc) ? "Untitled cover letter" : "Untitled resume"), variant: "primary" },
      ],
    });
    if (!next) return;
    try {
      await repo.put({ ...doc, title: next, updatedAt: new Date().toISOString() });
      announce(`${noun(doc)[0].toUpperCase()}${noun(doc).slice(1)} renamed.`);
      load();
    } catch (err) {
      fail(`rename the ${noun(doc)}`, err);
    }
  }

  async function duplicate(repo, doc) {
    try {
      await repo.put(isLetter(doc) ? duplicateLetter(doc) : duplicateResume(doc));
      toast({ message: `${noun(doc)[0].toUpperCase()}${noun(doc).slice(1)} duplicated.`, tone: "ok" });
      load();
    } catch (err) {
      fail(`duplicate the ${noun(doc)}`, err);
    }
  }

  async function remove(repo, doc) {
    const ok = await confirmDialog({
      title: `Delete “${doc.title}”?`,
      message: `This permanently deletes the ${noun(doc)} from this device. It cannot be undone. Nothing is stored anywhere else.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.remove(doc.id);
      if ((await repo.getLastResumeId()) === doc.id) await repo.setLastResumeId(null);
      if ((await repo.getLastLetterId()) === doc.id) await repo.setLastLetterId(null);
      announce(`${noun(doc)[0].toUpperCase()}${noun(doc).slice(1)} deleted.`);
      toast({ message: `${noun(doc)[0].toUpperCase()}${noun(doc).slice(1)} deleted.`, tone: "ok" });
      load();
    } catch (err) {
      fail(`delete the ${noun(doc)}`, err);
    }
  }

  function cardFor(repo, doc) {
    const act = (iconName, label, handler, cls = "") => {
      const b = h("button", { type: "button", class: `btn btn--ghost btn--sm btn--tool ${cls}`, "aria-label": `${label}: ${doc.title}` });
      b.innerHTML = icon(iconName) + `<span class="tool-label">${label}</span>`;
      b.addEventListener("click", handler);
      return b;
    };
    return h(
      "article",
      { class: "doc-card" },
      h("div", { class: "doc-card__badges" }, h("span", { class: "badge", text: isLetter(doc) ? "Cover letter" : "Resume" }), h("span", { class: "badge badge--muted", text: getTemplate(doc.templateId).name }), doc.metadata.isSample ? h("span", { class: "badge badge--warn", text: "Sample content" }) : null, h("span", { class: "badge badge--muted", text: doc.pageSize === "Letter" ? "US Letter" : "A4" })),
      h("h2", { class: "doc-card__title" }, h("a", { href: route(doc), text: doc.title })),
      h("p", { class: "doc-card__meta" }, "Last edited ", h("time", { datetime: doc.updatedAt, text: fmt(doc.updatedAt) })),
      h(
        "div",
        { class: "doc-card__actions" },
        h("a", { class: "btn btn--outline btn--sm", href: route(doc), "aria-label": `Open ${doc.title}`, text: "Open" }),
        act("pencil", "Rename", () => rename(repo, doc)),
        act("download", "Export", () => backupFlow({ docIds: [doc.id] })),
        act("copy", "Duplicate", () => duplicate(repo, doc)),
        act("trash", "Delete", () => remove(repo, doc), "btn--danger-text"),
      ),
    );
  }

  function paint(repo, items, unreadable) {
    const newButtons = h(
      "div",
      { class: "empty__actions" },
      h("button", { type: "button", class: "btn btn--primary", text: "New blank resume", onclick: () => create(createBlank("Untitled resume", getSettings().pageSize)) }),
      h("button", { type: "button", class: "btn btn--outline", text: "New cover letter", onclick: () => create(createBlankLetter("Untitled cover letter", getSettings().pageSize)) }),
      h("button", { type: "button", class: "btn btn--outline", text: "New fictional sample", onclick: () => create(createSample(getSettings().pageSize)) }),
      h("button", { type: "button", class: "btn btn--outline", text: "Sample cover letter", onclick: () => create(createLetterSample(getSettings().pageSize)) }),
    );

    const notices = [];
    if (!repo.persistent) notices.push(h("p", { class: "notice notice--warn", text: "Storage is unavailable in this browser (private browsing or blocked site data). Documents last only until you close this tab." }));
    if (unreadable.length) {
      const newer = unreadable.some((u) => u.code === "newer-version");
      notices.push(h("p", { class: "notice notice--warn", text: `${unreadable.length} stored document${unreadable.length === 1 ? "" : "s"} could not be read${newer ? " (saved by a newer version of the app, so reload to update)" : ""}. ${unreadable.length === 1 ? "It has" : "They have"} not been changed or deleted.` }));
    }

    const shown = items.filter((d) => filter === "all" || (filter === "letter") === isLetter(d));
    const filterBar = items.some(isLetter) && items.some((d) => !isLetter(d))
      ? h(
          "div",
          { class: "segmented saved__filter", role: "radiogroup", "aria-label": "Show" },
          FILTERS.map(([value, label]) => {
            const input = h("input", { type: "radio", name: "saved-filter", value });
            input.checked = filter === value;
            input.addEventListener("change", () => {
              filter = value;
              paint(repo, items, unreadable);
            });
            return h("label", { class: "segmented__option" }, input, h("span", { class: "segmented__label", text: label }));
          }),
        )
      : null;
    const body = items.length
      ? h("div", { class: "doc-grid" }, shown.map((d) => cardFor(repo, d)))
      : h(
          "section",
          { class: "empty" },
          h("span", { class: "empty__icon", html: undefined }),
          h("h2", { class: "empty__title", text: "No documents yet" }),
          h("p", { class: "empty__lead", text: "Create a resume or a cover letter to get started. Documents are stored only in this browser, so download a backup now and then." }),
          newButtons,
        );
    const art = body.querySelector?.(".empty__icon");
    if (art) art.innerHTML = icon("folder");

    root.replaceChildren(
      h(
        "div",
        { class: "container page" },
        h(
          "header",
          { class: "page-head page-head--row" },
          h("div", {}, h("h1", { class: "page-head__title", tabindex: "-1", text: "Saved documents" }), h("p", { class: "page-head__lead", text: "Stored only on this device. Clearing site data or using private browsing can remove them." })),
          items.length ? newButtons : null,
        ),
        h(
          "div",
          { class: "backup-bar" },
          h("span", { class: "backup-bar__text", text: lastBackupText() }),
          items.length ? h("button", { type: "button", class: "btn btn--outline btn--sm", text: "Back up all", onclick: async () => { if (await backupFlow()) load(); } }) : null,
          h("button", { type: "button", class: "btn btn--outline btn--sm", text: "Restore from backup", onclick: async () => { if (await restoreFlow()) load(); } }),
        ),
        ...notices,
        filterBar,
        body,
      ),
    );
  }

  load().catch(() => {
    if (!disposed) root.replaceChildren(h("p", { class: "page-loading container", text: "Could not load your documents." }));
  });
  return () => {
    disposed = true;
    cancelSkeleton();
  };
}
