import { getSettings } from "../state/settings.js";
import { CATEGORIES, TEMPLATES } from "../templates/registry.js";
import { applyTemplate } from "../templates/design.js";
import { createTemplateCard, sampleResume } from "../components/template-card.js";
import { createBlank } from "../models/resume.js";
import { getRepository } from "../storage/repository.js";
import { settleSaves } from "../state/resume-store.js";
import { openDialog } from "../components/dialog.js";
import { toast } from "../components/toast.js";
import { mountThumb } from "../preview/thumb.js";
import { h, icon } from "../utils/dom.js";

async function lastResume() {
  const repo = await getRepository();
  await settleSaves();
  const id = await repo.getLastResumeId().catch(() => null);
  const doc = id ? await repo.get(id).catch(() => null) : null;
  return { repo, doc };
}

/** Applies a template to the last-opened resume (content untouched) or starts a new blank one. */
async function useTemplate(t, { fresh = false } = {}) {
  try {
    const { repo, doc: existing } = await lastResume();
    let doc = fresh ? null : existing;
    if (doc) {
      applyTemplate(doc, t.id);
      doc.updatedAt = new Date().toISOString();
      toast({ message: `${t.name} applied to “${doc.title}”. Your content is unchanged.`, tone: "ok" });
    } else {
      doc = createBlank("Untitled resume", getSettings().pageSize);
      applyTemplate(doc, t.id);
      toast({ message: `New resume created with ${t.name}.`, tone: "ok" });
    }
    await repo.put(doc);
    await repo.setLastResumeId(doc.id);
    location.hash = `#/resume/${doc.id}`;
  } catch (err) {
    toast({ message: err?.name === "QuotaExceededError" ? "Not enough storage space." : "Could not apply the template. Storage may be unavailable.", tone: "warn", duration: 7000 });
  }
}

export default function templates(root) {
  const disposers = [];
  let existing = null;
  lastResume().then((r) => (existing = r.doc)).catch(() => {});

  root.innerHTML = `
  <div class="container page">
    <header class="page-head">
      <h1 class="page-head__title" tabindex="-1">Choose a template</h1>
      <p class="page-head__lead">Eight designs that make your content stand out. Previews use fictional sample content. Your own resume keeps its content when you switch.</p>
    </header>
    <p class="notice">${icon("info")}<span>ATS-conscious is a design goal (single column, real text, standard headings), not a guarantee of how any employer's system reads your resume. Decorative templates offer a simplified layout in the editor.</span></p>
    <div class="chips" role="group" aria-label="Filter templates by style" id="chips"></div>
    <p class="template-count" id="count" role="status" aria-live="polite"></p>
    <div class="template-grid" id="grid"></div>
  </div>`;

  const chips = root.querySelector("#chips");
  const grid = root.querySelector("#grid");
  const count = root.querySelector("#count");
  let active = "All";

  chips.innerHTML = CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c}" aria-pressed="${c === active}">${c}</button>`).join("");

  async function preview(t) {
    const frame = h("div", { class: "preview-dialog__frame" });
    const stop = mountThumb(frame, sampleResume(), t.id);
    const body = h("div", { class: "preview-dialog" }, frame);
    const side = h("div", {}, h("p", { text: t.blurb }));
    if (t.atsConscious) side.append(h("p", { class: "badge badge--ok", text: "ATS-conscious design goal" }));
    if (t.warnings.length) side.append(h("ul", { class: "prose-list" }, t.warnings.map((w) => h("li", { text: w }))));
    side.append(h("p", { class: "field__hint", text: existing ? `“Use template” applies it to “${existing.title}” without changing your content.` : "“Use template” starts a new blank resume with this design." }));
    body.append(side);
    const actions = [{ label: "Close", value: null, variant: "outline" }];
    if (existing) actions.push({ label: "New resume with this", value: "new", variant: "outline" });
    actions.push({ label: "Use template", value: "use", variant: "primary" });
    const choice = await openDialog({ title: `${t.name} template`, body, actions });
    stop();
    if (choice === "use") useTemplate(t);
    if (choice === "new") useTemplate(t, { fresh: true });
  }

  function draw() {
    disposers.splice(0).forEach((d) => d());
    const list = active === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.categories.includes(active));
    grid.replaceChildren();
    for (const t of list) {
      const card = createTemplateCard(t, { level: "h2", onPreview: preview, onUse: (tpl) => useTemplate(tpl) });
      disposers.push(card.destroy);
      grid.append(card.el);
    }
    count.textContent = `${list.length} ${list.length === 1 ? "template" : "templates"}${active === "All" ? "" : ` in ${active}`}`;
  }

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    active = btn.dataset.cat;
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    draw();
  });

  draw();
  return () => disposers.forEach((d) => d());
}
