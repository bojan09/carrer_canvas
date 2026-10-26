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
import { startTour, tourPending } from "../components/tour.js";
import { ELEMENT_ROLES } from "../templates/design.js";
import { captureFlip, playFlip } from "../utils/flip.js";
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
  let selectedBlock = null; // the block the Move panel nudges
  let selectedRole = "body"; // the kind of text the Format panel is editing
  const closedGroups = new Set(); // collapsed groups in the Style panel survive rebuilds
  const ctx = {
    change: (mutator, opts) => session.change(mutator, opts),
    announce,
    /** Announces a change and offers Undo right where the user is looking. */
    undoable: (message) => {
      announce(`${message} You can undo.`);
      toast({ message, tone: "ok", duration: 7000, action: { label: "Undo", onClick: () => doUndo() } });
    },
  };

  // ---- skeleton ----
  const title = h("input", { id: "doc-title", class: "studio__title", type: "text", maxlength: "120", autocomplete: "off", spellcheck: "false" });
  title.value = session.doc.title;
  const statusVisual = h("span", { class: "studio__status", "aria-hidden": "true" });
  const statusLive = h("span", { class: "sr-only", role: "status", "aria-live": "polite" });
  const retry = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Retry", hidden: true, onclick: () => session.retrySave() });

  const undoBtn = toolButton({ name: "undo", label: "Undo", text: "Undo", onClick: () => doUndo() });
  undoBtn.dataset.tour = "undo";
  const redoBtn = toolButton({ name: "redo", label: "Redo", text: "Redo", onClick: () => doRedo() });
  const sectionsBtn = adapter.hasRail ? toolButton({ name: "layers", label: "Manage sections", text: "Sections", onClick: () => openSectionsDialog() }) : null;
  sectionsBtn?.classList.add("studio__sections-btn");
  const exportBtn = h("button", { type: "button", class: "btn btn--primary btn--sm btn--tool studio__export" });
  exportBtn.innerHTML = `${icon("printer")}<span class="tool-label">Export PDF</span>`;
  exportBtn.setAttribute("aria-label", "Export PDF (opens the print dialog)");
  exportBtn.addEventListener("click", () => doExport());
  const checklistBadge = h("span", { class: "badge badge--warn studio__badge", hidden: true });
  const checklistBtn = toolButton({ name: "list-check", label: "Checklist", text: "Checklist", onClick: () => openChecklist() });
  checklistBtn.append(checklistBadge);
  checklistBtn.dataset.tour = "checklist";
  exportBtn.dataset.tour = "export";

  const bar = h(
    "div",
    { class: "studio__bar" },
    h("a", { class: "btn btn--ghost btn--sm studio__back", href: "#/saved", "aria-label": "Back to saved documents", html: undefined }),
    h(
      "div",
      { class: "studio__titlewrap" },
      h("label", { class: "sr-only", for: "doc-title", text: "Document title" }),
      title,
      h("div", { class: "studio__statusrow", "data-tour": "status" }, statusVisual, retry, statusLive),
    ),
    h("div", { class: "studio__actions" }, undoBtn, redoBtn, sectionsBtn, checklistBtn, exportBtn),
  );
  bar.querySelector(".studio__back").innerHTML = icon("arrow-left") + '<span class="tool-label">Saved</span>';

  const viewGroup = h("fieldset", { class: "studio__view", "data-tour": "view" }, h("legend", { class: "sr-only", text: "Show" }));
  const seg = h("div", { class: "segmented" });
  [
    ["edit", "Edit", "pencil"],
    ["design", "Style", "palette"],
    ["preview", "Preview", "eye"],
  ].forEach(([value, label, iconName], i) => {
    const input = h("input", { type: "radio", name: "studio-view", value });
    input.checked = i === 0;
    input.addEventListener("change", () => setView(value));
    const text = h("span", { class: "segmented__label studio__tab" });
    text.innerHTML = `${icon(iconName)}<span class="studio__tabtext"></span>`;
    text.querySelector(".studio__tabtext").textContent = label;
    if (value === "design" && !getSettings().styleSeen) text.append(h("span", { class: "studio__new", text: "New" }));
    seg.append(h("label", { class: `segmented__option${value === "preview" ? " studio__opt-preview" : ""}` }, input, text));
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
  const styleBtn = h("button", { type: "button", class: "btn btn--primary btn--sm studio__stylebtn", "data-tour": "style-btn" });
  const pickHintIcon = h("span", { class: "studio__pickicon" });
  pickHintIcon.innerHTML = icon("pointer");
  const preview = h(
    "section",
    { class: "studio__preview", "aria-label": "Preview" },
    h("div", { class: "studio__previewhead" }, h("h2", { text: "Preview" }), tplBadge, styleBtn, h("div", { class: "studio__zoom" }, zoomSelect)),
    h("p", { class: "studio__pickhint" }, pickHintIcon, document.createTextNode(" Click any text in the preview to change its font, colour, size or boldness. Drag a block to move it.")),
    previewScroll,
    h("p", { class: "studio__previewnote" }, pageInfo, document.createTextNode(" Page-break guides are estimates. The saved PDF is what counts.")),
  );
  const paper = mountPaper(previewScroll, {
    zoom: getSettings().previewZoom,
    onPick: (role, blockId) => pickRole(role, { block: blockId }),
    getMove: (id) => session.doc.designSettings.moves?.[id] || null,
    onMove: (id, x, y) => {
      selectedBlock = id;
      ctx.change(
        () => {
          const moves = (session.doc.designSettings.moves ||= {});
          if (x || y) moves[id] = { x, y };
          else delete moves[id];
          if (!Object.keys(moves).length) delete session.doc.designSettings.moves;
        },
        { group: `move.${id}`, structural: true },
      );
      paper.setBlock(id);
    },
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
    if (value === "design") {
      ensureDesign();
      if (!getSettings().styleSeen) {
        updateSettings({ styleSeen: true });
        viewGroup.querySelectorAll(".studio__new").forEach((n) => n.remove());
      }
    }
    syncStyleButton();
    paper.setSelection(value === "design" ? selectedRole : null);
    paper.setDrag(value === "design");
    paper.setBlock(value === "design" ? selectedBlock : null);
    window.scrollTo(0, 0);
  }

  /** The always-visible Style button flips between "open Style" and "back to editing". */
  function syncStyleButton() {
    const inStyle = studio.dataset.view === "design";
    styleBtn.innerHTML = `${icon(inStyle ? "pencil" : "palette")}<span class="tool-label"></span>`;
    styleBtn.querySelector(".tool-label").textContent = inStyle ? `Back to editing` : `Style this ${adapter.noun}`;
    styleBtn.classList.toggle("btn--primary", !inStyle);
    styleBtn.classList.toggle("btn--outline", inStyle);
    styleBtn.setAttribute("aria-pressed", String(inStyle));
  }
  styleBtn.addEventListener("click", () => {
    const next = studio.dataset.view === "design" ? "edit" : "design";
    viewGroup.querySelector(`input[value="${next}"]`).checked = true;
    setView(next);
  });

  /** A click on text in the preview (or a chip in the Format panel) chooses what to format. */
  function pickRole(role, { focus = true, block = null } = {}) {
    if (!ELEMENT_ROLES[role] || (adapter.kind === "letter" && role === "heading")) return;
    selectedRole = role;
    if (block) selectedBlock = block;
    designStale = true;
    viewGroup.querySelector('input[value="design"]').checked = true;
    setView("design");
    announce(`Formatting ${ELEMENT_ROLES[role].label}.`);
    requestAnimationFrame(() => {
      const card = designHost.querySelector(".format");
      card?.scrollIntoView({ block: "nearest" });
      if (focus) designHost.querySelector('.format__chips [aria-checked="true"]')?.focus({ preventScroll: true });
    });
  }

  function ensureDesign() {
    if (!designStale) return;
    designApi?.destroy();
    designApi = designPanel({
      session,
      ctx,
      sample: adapter.sample,
      role: selectedRole,
      block: selectedBlock,
      onBlock: (id) => {
        selectedBlock = id;
        paper.setBlock(id);
        designStale = true;
        ensureDesign();
        designHost.querySelector('[data-focus-key="move:block"]')?.focus({ preventScroll: true });
      },
      closed: closedGroups,
      onRole: (role, { focus = false } = {}) => {
        selectedRole = role;
        paper.setSelection(role);
        designStale = true;
        ensureDesign();
        if (focus) designHost.querySelector(`[data-focus-key="format:role:${role}"]`)?.focus({ preventScroll: true });
      },
    });
    designHost.replaceChildren(designApi.el);
    designStale = false;
  }
  root.replaceChildren(studio);

  // ---- rendering ----
  function buildCard(desc) {
    const { id, label, iconName, meta = "", hidden = false, fill } = desc;
    const bodyId = `sec-${id}-body`;
    const toggle = h("button", { type: "button", class: "sec__toggle", "aria-controls": bodyId, "data-focus-key": `sec:${id}` });
    toggle.innerHTML = `${icon(iconName)}<span class="sec__label"></span><span class="sec__meta"></span><span class="sec__issues badge badge--warn" hidden></span>${icon("chevron-down", "sec__chev")}`;
    toggle.querySelector(".sec__label").textContent = label;
    toggle.querySelector(".sec__meta").textContent = meta;

    const body = h("div", { class: "sec__body", id: bodyId });
    const card = h("section", { class: `sec${hidden ? " is-hidden" : ""}`, id: `sec-${id}`, "data-section-id": id, "data-flip-key": `card:${id}` }, h("h3", { class: "sec__title" }, toggle), body);

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

  /** Contextual checklist: each section card shows how many checklist items point at it. */
  function paintIssues(checks) {
    const counts = {};
    for (const c of checks) if (!c.ok && c.section) counts[c.section] = (counts[c.section] || 0) + 1;
    editor.querySelectorAll(".sec").forEach((card) => {
      const badge = card.querySelector(".sec__issues");
      const n = counts[card.dataset.sectionId] || 0;
      badge.hidden = n === 0;
      badge.textContent = n ? `${n} to check` : "";
    });
  }

  let previewTimer;
  function renderPreview() {
    paper.update(session.doc);
    tplBadge.textContent = `${getTemplate(session.doc.templateId).name}${session.doc.designSettings.simplified ? " · simplified" : ""}`;
    const checks = adapter.analyze(session.doc);
    paintIssues(checks);
    const n = checks.filter((c) => !c.ok).length;
    checklistBadge.hidden = n === 0;
    // With items to review the button's name comes from its content: "Checklist" + the count + "to review".
    checklistBadge.replaceChildren(document.createTextNode(String(n)), h("span", { class: "sr-only", text: " to review" }));
    if (n) checklistBtn.removeAttribute("aria-label");
    else checklistBtn.setAttribute("aria-label", "Checklist");
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
      const flipBefore = event.restored ? new Map() : captureFlip(studio);
      if (event.expand) expanded.add(event.expand);
      if (document.activeElement !== title) title.value = session.doc.title;
      renderEditor();
      paintIssues(adapter.analyze(session.doc));
      renderRails();
      designStale = true;
      if (studio.dataset.view === "design") ensureDesign();
      window.scrollTo(0, y);
      focusKey(event.focusKey);
      playFlip(studio, flipBefore);
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

  const switchView = (value) => {
    const input = viewGroup.querySelector(`input[value="${value}"]`);
    if (!input || !input.getClientRects().length) return; // Preview tab is hidden on wide screens
    input.checked = true;
    setView(value);
  };

  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault(); // the browser's "save page" dialog is not wanted here: the document saves itself
      session.flush().finally(() => toast({ message: persistent ? "Your work is saved on this device. It also saves automatically as you type." : "Storage is unavailable in this browser, so this tab cannot save your work.", tone: persistent ? "ok" : "warn", duration: 3000 }));
      return;
    }
    if (e.altKey && !mod && !e.shiftKey && ["1", "2", "3"].includes(e.key) && !isTextEntry(e.target)) {
      e.preventDefault();
      switchView({ 1: "edit", 2: "preview", 3: "design" }[e.key]);
      return;
    }
    if (!mod || e.altKey || isTextEntry(e.target)) return;
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
  syncStyleButton();
  const barObserver = new ResizeObserver(() => studio.style.setProperty("--bar-h", `${bar.offsetHeight}px`));
  barObserver.observe(bar);

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
        ctx.undoable("Unsaved changes restored.");
      } else session.discardRecovered();
    });
  }

  // First-run tour: once, never over another dialog, and only after the layout has settled
  let tour = null;
  const tourTimer = setTimeout(() => {
    if (tourPending() && !document.querySelector("dialog[open]")) tour = startTour({ root: studio });
  }, 700);

  return () => {
    barObserver.disconnect();
    clearTimeout(tourTimer);
    tour?.stop();
    clearTimeout(previewTimer);
    paper.destroy();
    designApi?.destroy();
    unsubscribe();
    document.removeEventListener("keydown", onKey);
  };
}
