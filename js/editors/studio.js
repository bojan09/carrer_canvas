import { h, icon } from "../utils/dom.js";
import { cleanText } from "../utils/sanitization.js";
import { announce } from "../components/announcer.js";
import { openDialog } from "../components/dialog.js";
import { mountPaper, ZOOM_MODES } from "../preview/paper.js";
import { getTemplate } from "../templates/registry.js";
import { PAPER } from "../templates/design.js";
import { getSettings, updateSettings } from "../state/settings.js";
import { designPanel } from "./design-panel.js";
import { openPrintDialog, shouldReview } from "./print-dialog.js";
import { printResume } from "../export/print.js";
import { toast } from "../components/toast.js";
import { sectionsList } from "./sections-rail.js";
import { resumeAdapter } from "./resume-adapter.js";

const isTextEntry = (el) => el && el.closest && el.closest("input, textarea, select, [contenteditable='true']");

function toolButton({ name, label, text, onClick }) {
  const btn = h("button", { type: "button", class: "btn btn--outline btn--sm btn--tool" });
  btn.innerHTML = icon(name) + (text ? `<span class="tool-label">${text}</span>` : "");
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

/** The editing studio for one open document. Returns a cleanup function. */
export function mountStudio(root, session, { persistent, adapter = resumeAdapter }) {
  const Noun = adapter.noun[0].toUpperCase() + adapter.noun.slice(1);
  const expanded = new Set(["contact"]);
  const ctx = {
    change: (mutator, opts) => session.change(mutator, opts),
    announce,
  };

  // ---- skeleton ----
  const title = h("input", { id: "doc-title", class: "studio__title", type: "text", maxlength: "120", autocomplete: "off", spellcheck: "false" });
  title.value = session.doc.title;
  const statusVisual = h("span", { class: "studio__status", "aria-hidden": "true" });
  const statusLive = h("span", { class: "sr-only", role: "status", "aria-live": "polite" });
  const retry = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Retry", hidden: true, onclick: () => session.retrySave() });

  const undoBtn = toolButton({ name: "undo", label: "Undo", text: "Undo", onClick: () => doUndo() });
  const redoBtn = toolButton({ name: "redo", label: "Redo", text: "Redo", onClick: () => doRedo() });
  const sectionsBtn = adapter.hasRail ? toolButton({ name: "layers", label: "Manage sections", text: "Sections", onClick: () => openSectionsDialog() }) : null;
  sectionsBtn?.classList.add("studio__sections-btn");
  const exportBtn = h("button", { type: "button", class: "btn btn--primary btn--sm btn--tool studio__export" });
  exportBtn.innerHTML = `${icon("printer")}<span class="tool-label">Export PDF</span>`;
  exportBtn.setAttribute("aria-label", "Export as PDF (opens the print dialog)");
  exportBtn.addEventListener("click", () => doExport());
  const checklistBadge = h("span", { class: "badge badge--warn studio__badge", hidden: true });
  const checklistBtn = toolButton({ name: "list-check", label: "Writing checklist", text: "Checklist", onClick: () => openChecklist() });
  checklistBtn.append(checklistBadge);

  const bar = h(
    "div",
    { class: "studio__bar" },
    h("a", { class: "btn btn--ghost btn--sm studio__back", href: "#/saved", "aria-label": "Back to saved documents", html: undefined }),
    h(
      "div",
      { class: "studio__titlewrap" },
      h("label", { class: "sr-only", for: "doc-title", text: "Document title" }),
      title,
      h("div", { class: "studio__statusrow" }, statusVisual, retry, statusLive),
    ),
    h("div", { class: "studio__actions" }, undoBtn, redoBtn, sectionsBtn, checklistBtn, exportBtn),
  );
  bar.querySelector(".studio__back").innerHTML = icon("arrow-left") + '<span class="tool-label">Saved</span>';

  const viewGroup = h("fieldset", { class: "studio__view" }, h("legend", { class: "sr-only", text: "Show" }));
  const seg = h("div", { class: "segmented" });
  [
    ["edit", "Edit"],
    ["preview", "Preview"],
    ["design", "Design"],
  ].forEach(([value, label], i) => {
    const input = h("input", { type: "radio", name: "studio-view", value });
    input.checked = i === 0;
    input.addEventListener("change", () => setView(value));
    seg.append(h("label", { class: `segmented__option${value === "preview" ? " studio__opt-preview" : ""}` }, input, h("span", { class: "segmented__label", text: label })));
  });
  viewGroup.append(seg);

  const banners = h("div", { class: "studio__banners" });
  const railHost = h("nav", { class: "studio__rail", "aria-label": "Sections" });
  const editor = h("div", { class: "studio__editor" });
  const previewScroll = h("div", { class: "studio__paperwrap" });
  const zoomSelect = h("select", { class: "input input--select", id: "zoom-select", "aria-label": "Preview zoom" });
  ZOOM_MODES.forEach(([v, label]) => zoomSelect.append(h("option", { value: v, text: label })));
  zoomSelect.value = getSettings().previewZoom;
  const pageInfo = h("span", { class: "studio__pageinfo", role: "status" });
  const tplBadge = h("span", { class: "badge" });
  const preview = h(
    "section",
    { class: "studio__preview", "aria-label": "Preview" },
    h("div", { class: "studio__previewhead" }, h("h2", { text: "Preview" }), tplBadge, h("div", { class: "studio__zoom" }, zoomSelect)),
    previewScroll,
    h("p", { class: "studio__previewnote" }, pageInfo, document.createTextNode(" Page-break guides are estimates. The saved PDF is what counts.")),
  );
  const paper = mountPaper(previewScroll, {
    zoom: getSettings().previewZoom,
    onInfo: ({ pages, paper: size }) => {
      lastPages = pages;
      pageInfo.textContent = `About ${pages} page${pages === 1 ? "" : "s"} · ${PAPER[size].label.split(" (")[0]}.`;
    },
  });
  zoomSelect.addEventListener("change", () => {
    paper.setZoom(zoomSelect.value);
    updateSettings({ previewZoom: zoomSelect.value });
  });
  const designHost = h("div", { class: "studio__design" });
  let designApi = null;
  let designStale = true;

  const studio = h(
    "div",
    { class: "studio", "data-view": "edit", "data-doc": adapter.kind },
    bar,
    banners,
    h("div", { class: "studio__grid" }, adapter.hasRail ? railHost : null, h("section", { class: "studio__editorwrap", "aria-label": `${Noun} content` }, editor, designHost), preview),
  );
  bar.append(viewGroup);

  function setView(value) {
    studio.dataset.view = value;
    if (value === "design") ensureDesign();
    window.scrollTo(0, 0);
  }

  function ensureDesign() {
    if (!designStale) return;
    designApi?.destroy();
    designApi = designPanel({ session, ctx, sample: adapter.sample });
    designHost.replaceChildren(designApi.el);
    designStale = false;
  }
  root.replaceChildren(studio);

  // ---- rendering ----
  function buildCard(desc) {
    const { id, label, iconName, meta = "", hidden = false, fill } = desc;
    const bodyId = `sec-${id}-body`;
    const toggle = h("button", { type: "button", class: "sec__toggle", "aria-controls": bodyId, "data-focus-key": `sec:${id}` });
    toggle.innerHTML = `${icon(iconName)}<span class="sec__label"></span><span class="sec__meta"></span>${icon("chevron-down", "sec__chev")}`;
    toggle.querySelector(".sec__label").textContent = label;
    toggle.querySelector(".sec__meta").textContent = meta;

    const body = h("div", { class: "sec__body", id: bodyId });
    const card = h("section", { class: `sec${hidden ? " is-hidden" : ""}`, id: `sec-${id}`, "data-section-id": id }, h("h3", { class: "sec__title" }, toggle), body);

    const apply = () => {
      const open = expanded.has(id);
      toggle.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
      card.classList.toggle("is-open", open);
      if (open && !body.childElementCount) fill(body);
    };
    toggle.addEventListener("click", () => {
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      apply();
    });
    apply();
    return card;
  }

  function renderEditor() {
    editor.replaceChildren(...adapter.cards(session, ctx).map(buildCard));
  }

  const railHosts = new Set([railHost]);
  function renderRails() {
    if (!adapter.hasRail) return;
    for (const host of railHosts) host.replaceChildren(sectionsList({ session, ctx, onNavigate: (id) => navigateTo(id, host) }));
  }

  function navigateTo(id, host) {
    host?.closest?.("dialog")?.close();
    expanded.add(id);
    renderEditor();
    setView("edit");
    viewGroup.querySelector('input[value="edit"]').checked = true;
    const toggle = editor.querySelector(`[data-focus-key="sec:${id}"]`);
    requestAnimationFrame(() => {
      toggle?.scrollIntoView({ block: "start", behavior: "auto" });
      toggle?.focus({ preventScroll: true });
    });
  }

  async function openSectionsDialog() {
    const host = h("div", { class: "rail-dialog" });
    railHosts.add(host);
    host.append(sectionsList({ session, ctx, onNavigate: (id) => navigateTo(id, host) }));
    await openDialog({ title: "Sections", body: host, actions: [{ label: "Done", value: true, variant: "primary" }] });
    railHosts.delete(host);
  }

  function openChecklist() {
    const checks = adapter.analyze(session.doc);
    const todo = checks.filter((c) => !c.ok);
    const list = h(
      "ul",
      { class: "checklist" },
      checks.map((c) => {
        const li = h("li", { class: c.ok ? "is-ok" : "is-todo" });
        li.innerHTML = icon(c.ok ? "check" : "alert");
        const text = h("div", {}, h("strong", { text: c.label }), c.ok ? null : h("p", { text: c.detail }));
        if (!c.ok && c.section) {
          const go = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Go to section" });
          go.addEventListener("click", () => navigateTo(c.section, go));
          text.append(go);
        }
        li.append(text);
        return li;
      }),
    );
    const body = h("div", {}, h("p", { text: todo.length ? `${todo.length} thing${todo.length === 1 ? "" : "s"} to look at. This is friendly guidance, not a score, and no checklist can predict how any employer's system reads your ${adapter.noun}.` : "Everything on this list looks good. Still read the preview carefully before sharing." }), list);
    openDialog({ title: "Writing checklist", body, actions: [{ label: "Close", value: true, variant: "primary" }] });
  }

  // ---- banners ----
  function renderBanners() {
    banners.replaceChildren();
    if (!persistent) {
      banners.append(
        h("p", { class: "notice notice--warn", role: "note" }, h("span", { html: undefined, text: "Storage is unavailable in this browser (private browsing or blocked site data). Your work stays in this tab only and will be lost when you close it. Do not rely on it." })),
      );
    }
    if (session.doc.metadata.isSample) {
      const btn = h("button", { type: "button", class: "btn btn--outline btn--sm", text: "I've replaced the sample content" });
      btn.addEventListener("click", () => ctx.change(() => (session.doc.metadata.isSample = false), { structural: false }));
      banners.append(h("div", { class: "notice notice--warn", role: "note" }, h("span", { text: `This is fictional sample content. Replace it with your own details before using this ${adapter.noun}.` }), btn));
    }
  }

  // ---- status / undo / preview ----
  let lastLive = "";
  function renderStatus() {
    const { state, lastSavedAt } = session.saveInfo;
    let visual;
    let live = "";
    if (!persistent) visual = "Not stored (this tab only)";
    else if (state === "dirty" || state === "saving") visual = "Saving…";
    else if (state === "error") {
      visual = "Couldn't save changes";
      live = "Couldn't save your changes. Use Retry.";
    } else {
      const t = lastSavedAt ? ` · ${lastSavedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
      visual = `Saved on this device${t}`;
      if (state === "saved") live = "Saved on this device.";
    }
    statusVisual.textContent = visual;
    statusVisual.classList.toggle("is-error", state === "error");
    retry.hidden = state !== "error";
    if (live && live !== lastLive) statusLive.textContent = live;
    lastLive = live;
  }

  function renderHistoryButtons() {
    undoBtn.setAttribute("aria-disabled", String(!session.history.canUndo));
    redoBtn.setAttribute("aria-disabled", String(!session.history.canRedo));
  }

  let previewTimer;
  function renderPreview() {
    paper.update(session.doc);
    tplBadge.textContent = `${getTemplate(session.doc.templateId).name}${session.doc.designSettings.simplified ? " · simplified" : ""}`;
    const n = adapter.openIssues(session.doc);
    checklistBadge.hidden = n === 0;
    checklistBadge.textContent = String(n);
    checklistBtn.setAttribute("aria-label", n ? `Writing checklist, ${n} to review` : "Writing checklist");
  }
  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 120);
  };

  let lastPages = 1;
  async function doExport() {
    await session.flush();
    let options = { simplified: false };
    if (shouldReview()) {
      const choice = await openPrintDialog({ doc: session.doc, pages: lastPages, issues: adapter.analyze(session.doc) });
      if (!choice) return;
      options = choice;
    }
    try {
      const { pageRule } = await printResume(session.doc, options);
      if (!pageRule) toast({ message: "This browser did not accept the page size. Pick the paper size in the print dialog.", tone: "warn", duration: 8000 });
    } catch {
      toast({ message: "Could not open the print dialog in this browser.", tone: "warn" });
    }
  }

  function doUndo() {
    if (undoBtn.getAttribute("aria-disabled") === "true") return;
    if (session.undo()) announce("Undone.");
  }
  function doRedo() {
    if (redoBtn.getAttribute("aria-disabled") === "true") return;
    if (session.redo()) announce("Redone.");
  }

  function focusKey(key) {
    if (!key) return;
    const find = (k) => root.querySelector(`[data-focus-key="${CSS.escape(k)}"]`);
    let el = find(key);
    // A moved item may now be first/last, so its up/down button is disabled: use the opposite one.
    if (el?.disabled) el = find(key.replace(/:(up|down)$/, (_, d) => (d === "up" ? ":down" : ":up")));
    el?.focus();
  }

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "save") return renderStatus();
    // change
    if (event.structural) {
      const y = window.scrollY;
      if (event.expand) expanded.add(event.expand);
      if (document.activeElement !== title) title.value = session.doc.title;
      renderEditor();
      renderRails();
      designStale = true;
      if (studio.dataset.view === "design") ensureDesign();
      window.scrollTo(0, y);
      focusKey(event.focusKey);
    }
    renderBanners();
    renderHistoryButtons();
    renderStatus();
    schedulePreview();
  });

  title.addEventListener("input", () => session.change(() => (session.doc.title = cleanText(title.value, 120)), { group: "title" }));
  title.addEventListener("blur", () => {
    if (!title.value.trim()) {
      title.value = adapter.untitled;
      session.change(() => (session.doc.title = adapter.untitled), { group: "title" });
    }
  });

  const onKey = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextEntry(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) (e.preventDefault(), doUndo());
    else if ((k === "z" && e.shiftKey) || k === "y") (e.preventDefault(), doRedo());
  };
  document.addEventListener("keydown", onKey);

  renderEditor();
  renderRails();
  renderBanners();
  renderHistoryButtons();
  renderStatus();
  renderPreview();

  // Offer back unsaved changes left by an interrupted session (never applied silently)
  const recovered = session.recoverable();
  if (recovered) {
    const when = new Date(recovered.savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    openDialog({
      title: "Recover unsaved changes?",
      body: `This ${adapter.noun} has newer changes from ${when} that were not fully saved because the page closed first. Restore them, or keep the last saved version.`,
      actions: [
        { label: "Keep saved version", value: false, variant: "outline" },
        { label: "Restore changes", value: true, variant: "primary" },
      ],
    }).then((restore) => {
      if (restore) {
        session.adoptRecovered(recovered.doc);
        announce("Unsaved changes restored. You can undo.");
      } else session.discardRecovered();
    });
  }

  return () => {
    clearTimeout(previewTimer);
    paper.destroy();
    designApi?.destroy();
    unsubscribe();
    document.removeEventListener("keydown", onKey);
  };
}
