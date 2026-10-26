import { h } from "../utils/dom.js";
import { createSample } from "../models/resume.js";
import { TEMPLATES, getTemplate } from "../templates/registry.js";
import { ACCENT_SWATCHES, DIVIDERS, FONT_PAIRS, LIMITS, PAPER, applyTemplate, contrastRatio, renderTemplateOf, resolveDesign } from "../templates/design.js";
import { mountThumb } from "../preview/thumb.js";
import { announce } from "../components/announcer.js";
import { photoControls } from "./photo-controls.js";

let sampleDoc = null;
const sample = () => (sampleDoc ||= createSample());

let uid = 0;
const nid = (p) => `${p}-${++uid}`;

function segmented(name, options, value, onChange, { disabled = false, label } = {}) {
  const wrap = h("div", { class: "segmented", role: "radiogroup", "aria-label": label });
  for (const [v, text] of options) {
    const input = h("input", { type: "radio", name, value: v });
    input.checked = v === value;
    input.disabled = disabled;
    input.addEventListener("change", () => input.checked && onChange(v));
    wrap.append(h("label", { class: "segmented__option" }, input, h("span", { class: "segmented__label", text })));
  }
  return wrap;
}

const FORMAT = {
  titleScale: (v) => `${Math.round(v * 100)}%`,
  bodyScale: (v) => `${Math.round(v * 100)}%`,
  lineHeight: (v) => v.toFixed(2),
  sectionGap: (v) => `${Math.round(v)} px`,
  margins: (v) => `${Math.round(v)} mm`,
};

/** Design controls. All values are overrides on the template defaults; undo/redo covers every change. */
export function designPanel({ session, ctx, sample: sampleFor = sample }) {
  const doc = session.doc;
  const disposers = [];
  const root = h("div", { class: "design" });
  const design = resolveDesign(doc);
  const chosen = getTemplate(doc.templateId);
  const rendered = renderTemplateOf(doc);
  const set = (key, value, opts = {}) => ctx.change(() => (doc.designSettings[key] = value), { group: `design.${key}`, ...opts });

  // ---- templates ----
  const templates = h("section", { class: "design__group", "aria-labelledby": "dz-tpl" }, h("h3", { id: "dz-tpl", text: "Template" }));
  const grid = h("div", { class: "design__templates", role: "group", "aria-label": "Choose a template" });
  for (const t of TEMPLATES) {
    const frame = h("div", {});
    const btn = h("button", { type: "button", class: "design__tpl", "aria-pressed": String(t.id === chosen.id), "data-focus-key": `tpl:${t.id}` }, frame, h("span", { class: "design__tplname", text: t.name }));
    if (t.atsConscious) btn.append(h("span", { class: "badge badge--ok", text: "ATS-conscious" }));
    disposers.push(mountThumb(frame, sampleFor(), t.id));
    btn.addEventListener("click", () => {
      if (t.id === doc.templateId) return;
      ctx.change(() => applyTemplate(doc, t.id), { structural: true, focusKey: `tpl:${t.id}` });
      announce(`${t.name} template applied. Your content is unchanged.`);
    });
    grid.append(btn);
  }
  templates.append(grid);

  const notes = h("div", { class: "design__notes" });
  if (chosen.warnings.length && !design.simplified) {
    notes.append(h("div", { class: "notice notice--warn" }, h("div", {}, h("strong", { text: `${chosen.name}: layout notes` }), h("ul", { class: "prose-list" }, chosen.warnings.map((w) => h("li", { text: w }))))));
  }
  templates.append(notes);

  const simp = h("label", { class: "check design__simplified" });
  const simpInput = h("input", { type: "checkbox", class: "check__input" });
  simpInput.checked = chosen.atsConscious || design.simplified;
  simpInput.disabled = chosen.atsConscious;
  simpInput.addEventListener("change", () => ctx.change(() => (doc.designSettings.simplified = simpInput.checked), { structural: true, focusKey: "design:simplified" }));
  simpInput.dataset.focusKey = "design:simplified";
  simp.append(simpInput, h("span", {}, h("strong", { text: "Simplified layout (ATS-conscious style)" }), h("small", { text: chosen.atsConscious ? `${chosen.name} is already single-column and plain.` : "Single column, no sidebar, no dark fills, no photo. Your accent colour, fonts and spacing still apply. ATS-conscious describes a design goal, not a guarantee." })));
  templates.append(simp);
  root.append(templates);

  // ---- colour ----
  const colour = h("section", { class: "design__group", "aria-labelledby": "dz-col" }, h("h3", { id: "dz-col", text: "Accent colour" }));
  const swatches = h("div", { class: "swatches", role: "group", "aria-label": "Accent colour swatches" });
  const contrast = h("p", { class: "field__hint", role: "status" });
  const paintContrast = (hex) => {
    const ratio = contrastRatio(hex, rendered.paperBg);
    contrast.textContent = ratio < 4.5 ? `Low contrast (${ratio.toFixed(1)}:1) against this page. Headings in this colour may be hard to read, especially on paper.` : `Contrast against the page: ${ratio.toFixed(1)}:1.`;
    contrast.classList.toggle("is-warn", ratio < 4.5);
  };
  const custom = h("input", { type: "color", class: "swatch__custom", "aria-label": "Custom accent colour", value: design.accent });
  const choices = [...new Set([chosen.defaults.accent, ...ACCENT_SWATCHES])];
  for (const hex of choices) {
    const b = h("button", { type: "button", class: "swatch", "aria-label": `Accent ${hex}${hex === chosen.defaults.accent ? " (template default)" : ""}`, "aria-pressed": String(hex.toLowerCase() === design.accent.toLowerCase()) });
    b.style.setProperty("--sw", hex);
    b.addEventListener("click", () => {
      set("accent", hex);
      swatches.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", String(s === b)));
      custom.value = hex;
      paintContrast(hex);
    });
    swatches.append(b);
  }
  custom.addEventListener("input", () => {
    set("accent", custom.value.toLowerCase());
    swatches.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", "false"));
    paintContrast(custom.value);
  });
  swatches.append(h("label", { class: "swatch swatch--custom" }, custom, h("span", { class: "sr-only", text: "Custom colour" })));
  paintContrast(design.accent);
  colour.append(swatches, contrast);
  root.append(colour);

  // ---- type & spacing ----
  const type = h("section", { class: "design__group", "aria-labelledby": "dz-type" }, h("h3", { id: "dz-type", text: "Type and spacing" }));
  type.append(
    h("p", { class: "field__label", text: "Font pairing" }),
    segmented("dz-font", Object.entries(FONT_PAIRS).map(([k, v]) => [k, v.label]), design.fontPair, (v) => set("fontPair", v), { label: "Font pairing" }),
    h("p", { class: "field__hint", text: "Uses fonts already on your device, so the look can differ slightly between phones and computers." }),
  );
  for (const key of Object.keys(LIMITS)) {
    const lim = LIMITS[key];
    const id = nid("rng");
    const out = h("output", { for: id, text: FORMAT[key](design[key]) });
    const input = h("input", { type: "range", id, class: "range", min: String(lim.min), max: String(lim.max), step: String(lim.step) });
    input.value = String(design[key]);
    input.setAttribute("aria-valuetext", FORMAT[key](design[key]));
    input.addEventListener("input", () => {
      const v = Number(input.value);
      out.textContent = FORMAT[key](v);
      input.setAttribute("aria-valuetext", FORMAT[key](v));
      set(key, v);
    });
    type.append(h("div", { class: "slider" }, h("label", { for: id, text: lim.label }), out, input));
  }
  root.append(type);

  // ---- structure ----
  const struct = h("section", { class: "design__group", "aria-labelledby": "dz-struct" }, h("h3", { id: "dz-struct", text: "Structure" }));
  if (doc.kind !== "cover-letter") {
    struct.append(
      h("p", { class: "field__label", text: "Section divider" }),
      segmented("dz-div", DIVIDERS.map((d) => [d, { none: "None", line: "Line", thick: "Thick", dotted: "Dotted" }[d]]), design.dividerStyle, (v) => set("dividerStyle", v), { label: "Section divider" }),
    );
  }
  struct.append(
    h("p", { class: "field__label", text: "Header alignment" }),
    segmented("dz-align", [["left", "Left"], ["center", "Centre"]], design.headerAlign, (v) => set("headerAlign", v), { disabled: !rendered.supports.headerAlign, label: "Header alignment" }),
  );
  if (!rendered.supports.headerAlign) struct.append(h("p", { class: "field__hint", text: `${rendered.name} fixes the header alignment as part of its design.` }));
  struct.append(
    h("p", { class: "field__label", text: "Paper size" }),
    segmented("dz-paper", Object.entries(PAPER).map(([k, v]) => [k, v.label.split(" (")[0]]), doc.pageSize, (v) => ctx.change(() => (doc.pageSize = v), { structural: false }), { label: "Paper size" }),
  );
  root.append(struct);

  // ---- photo ----
  root.append(photoControls({ doc, ctx, headingId: "dz-photo", level: "h3" }));

  // ---- reset ----
  const reset = h("button", { type: "button", class: "btn btn--outline", text: "Reset to template defaults" });
  reset.addEventListener("click", () => {
    ctx.change(() => {
      const keep = {};
      for (const k of ["simplified", "showPhoto", "photoShape"]) if (doc.designSettings[k] !== undefined) keep[k] = doc.designSettings[k];
      doc.designSettings = keep;
    }, { structural: true, focusKey: "design:reset" });
    announce("Design reset to the template defaults.");
  });
  reset.dataset.focusKey = "design:reset";
  root.append(h("div", { class: "design__reset" }, reset));

  return { el: root, destroy: () => disposers.forEach((d) => d()) };
}

