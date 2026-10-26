import { h } from "../utils/dom.js";
import { createSample } from "../models/resume.js";
import { DEFAULT_INK, DEFAULT_INK2, TEMPLATES, getTemplate } from "../templates/registry.js";
import { ACCENT_SWATCHES, DIVIDERS, FONT_PAIRS, LIMITS, OPACITY_LIMITS, PAPER, PHOTO_LIMITS, applyTemplate, contrastRatio, renderTemplateOf, resolveDesign } from "../templates/design.js";
import { mountThumb } from "../preview/thumb.js";
import { announce } from "../components/announcer.js";
import { photoControls } from "./photo-controls.js";
import { formatCard } from "./format-panel.js";
import { moveCard } from "./move-panel.js";

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
  fillOpacity: (v) => `${Math.round(v * 100)}%`,
  photoOpacity: (v) => `${Math.round(v * 100)}%`,
};

/** Design controls. All values are overrides on the template defaults; undo/redo covers every change. */
export function designPanel({ session, ctx, sample: sampleFor = sample, role = "body", onRole = () => {}, block = null, onBlock = () => {}, closed = new Set() }) {
  const doc = session.doc;
  const disposers = [];
  const root = h("div", { class: "design" });
  const jump = h("nav", { class: "design__jump", "aria-label": "Jump to a style group" });
  for (const [key, label] of [["template", "Template"], ["colour", "Colours"], ["type", "Text and fonts"], ["struct", "Layout"], ["move", "Move blocks"], ["photo", "Photo"]]) {
    const b = h("button", { type: "button", class: "chip-btn", text: label });
    b.addEventListener("click", () => {
      const target = root.querySelector(`#dg-${key}`);
      if (!target) return;
      if (target.tagName === "DETAILS") target.open = true;
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      target.querySelector("summary, h3")?.focus?.({ preventScroll: true });
    });
    jump.append(b);
  }
  root.append(jump);
  const design = resolveDesign(doc);
  const chosen = getTemplate(doc.templateId);
  const rendered = renderTemplateOf(doc);
  const set = (key, value, opts = {}) => ctx.change(() => (doc.designSettings[key] = value), { group: `design.${key}`, ...opts });

  /** Collapsible group (native details/summary: keyboard and screen-reader friendly). */
  const group = (key, id, title) => {
    const d = h("details", { class: "design__group", id: `dg-${key}` }, h("summary", { class: "design__summary" }, h("h3", { id, text: title })));
    d.open = !closed.has(key);
    d.addEventListener("toggle", () => (d.open ? closed.delete(key) : closed.add(key)));
    return d;
  };

  // ---- templates ----
  const templates = group("template", "dz-tpl", "Template");
  const grid = h("div", { class: "design__templates", role: "group", "aria-label": "Choose a template" });
  for (const t of TEMPLATES) {
    const frame = h("div", {});
    const btn = h("button", { type: "button", class: "design__tpl", "aria-pressed": String(t.id === chosen.id), "data-focus-key": `tpl:${t.id}` }, frame, h("span", { class: "design__tplname", text: t.name }));
    if (t.atsConscious) btn.append(h("span", { class: "badge badge--ok", text: "ATS-conscious" }));
    disposers.push(mountThumb(frame, sampleFor(), t.id));
    btn.addEventListener("click", () => {
      if (t.id === doc.templateId) return;
      let dropped = 0;
      ctx.change(() => (dropped = applyTemplate(doc, t.id).dropped), { structural: true, focusKey: `tpl:${t.id}` });
      if (dropped) ctx.undoable(`${t.name} applied. Your styles carried over; ${dropped} option${dropped === 1 ? " doesn't" : "s don't"} fit this template and ${dropped === 1 ? "was" : "were"} removed.`);
      else announce(`${t.name} template applied. Your content is unchanged.`);
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
  const colour = group("colour", "dz-col", "Accent colour");
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

  // ---- text colours, fills and transparency ----
  const tone = group("tone", "dz-tone", "Text colour and transparency");
  const clear = (key, focusKey) => ctx.change(() => delete doc.designSettings[key], { structural: true, focusKey });

  /** A colour picker with a reset button and an optional readability hint. */
  const colourControl = ({ key, label, fallback, disabled = false, hint, readable }) => {
    const id = nid("clr");
    const value = design[key] || fallback;
    const input = h("input", { type: "color", id, class: "colour__input", value, disabled });
    input.dataset.focusKey = `design:${key}`;
    const note = h("p", { class: "field__hint", role: "status" });
    const paint = (hex) => {
      if (!readable) return (note.textContent = hint || "");
      const ratio = contrastRatio(hex, rendered.paperBg);
      note.textContent = `${hint ? `${hint} ` : ""}Contrast against the page: ${ratio.toFixed(1)}:1.${ratio < 4.5 ? " That is low, so the text may be hard to read." : ""}`;
      note.classList.toggle("is-warn", ratio < 4.5);
    };
    const reset = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Use template colour", disabled: disabled || design[key] === undefined });
    reset.setAttribute("aria-label", `Use template colour for ${label.toLowerCase()}`);
    input.addEventListener("input", () => {
      set(key, input.value.toLowerCase());
      reset.disabled = false;
      paint(input.value);
    });
    reset.addEventListener("click", () => clear(key, `design:${key}`));
    paint(value);
    return h("div", { class: "colour" }, h("label", { class: "field__label", for: id, text: label }), h("div", { class: "colour__row" }, input, reset), note);
  };

  const opacityControl = ({ key, disabled = false }) => {
    const lim = OPACITY_LIMITS[key];
    const id = nid("rng");
    const out = h("output", { for: id, text: FORMAT[key](design[key]) });
    const input = h("input", { type: "range", id, class: "range", min: String(lim.min), max: String(lim.max), step: String(lim.step), disabled });
    input.value = String(design[key]);
    input.setAttribute("aria-valuetext", FORMAT[key](design[key]));
    input.addEventListener("input", () => {
      const v = Number(input.value);
      out.textContent = FORMAT[key](v);
      input.setAttribute("aria-valuetext", FORMAT[key](v));
      set(key, v);
    });
    return h("div", { class: "slider" }, h("label", { for: id, text: `${lim.label} opacity` }), out, input);
  };

  const textIsLight = rendered.printsOnWhite;
  tone.append(
    colourControl({ key: "textColor", label: "Text colour", fallback: rendered.ink || DEFAULT_INK, readable: true, hint: textIsLight ? `${rendered.name} prints on white with its own dark text, so this colour is for the screen only.` : "" }),
    colourControl({ key: "mutedColor", label: "Secondary text colour", fallback: rendered.ink2 || DEFAULT_INK2, readable: true, hint: "Dates, locations and similar details." }),
    colourControl({ key: "fillColor", label: "Background fill colour", fallback: rendered.fillDefault || design.accent, disabled: !rendered.supports.fills, hint: rendered.supports.fills ? (rendered.headerInk ? "Header text switches between light and dark automatically so it stays readable." : "") : `${rendered.name} has no decorative fills to colour.` }),
    opacityControl({ key: "fillOpacity", disabled: !rendered.supports.fills }),
    opacityControl({ key: "photoOpacity" }),
    h("p", { class: "field__hint", text: "Lower the opacity to fade backgrounds, cards and tints, or the photo. Text stays fully readable." }),
  );
  root.append(tone);

  // ---- type & spacing ----
  const type = group("type", "dz-type", "Text, fonts and spacing");
  type.append(
    formatCard({ doc, ctx, role, onRole, sample: sampleFor }),
    h("h4", { class: "design__sub", text: "Whole document" }),
    h("p", { class: "field__label", text: "Font pairing preset" }),
    segmented("dz-font", Object.entries(FONT_PAIRS).map(([k, v]) => [k, v.label]), design.fontPair, (v) => set("fontPair", v), { label: "Font pairing" }),
    h("p", { class: "field__hint", text: "A quick preset that uses fonts already on your device, so it can look slightly different on other devices. For a specific font, use Format text above." }),
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
  const struct = group("struct", "dz-struct", "Layout and page");
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
  const letter = doc.kind === "cover-letter";
  const sidebarOnly = letter && rendered.layout !== "single";
  const flip = h("label", { class: "check design__flip" });
  const flipInput = h("input", { type: "checkbox", class: "check__input" });
  flipInput.checked = design.mirror;
  flipInput.disabled = !rendered.supports.mirror || sidebarOnly;
  flipInput.dataset.focusKey = "design:mirror";
  flipInput.addEventListener("change", () => ctx.change(() => (flipInput.checked ? (doc.designSettings.mirror = true) : delete doc.designSettings.mirror), { structural: true, focusKey: "design:mirror" }));
  flip.append(flipInput, h("span", {}, h("strong", { text: "Flip layout" }), h("small", { text: !rendered.supports.mirror ? `${rendered.name} keeps its photo and decoration in a fixed place.` : sidebarOnly ? `A letter in ${rendered.name} is a single column, so there is nothing to flip.` : "Moves the photo, or the sidebar in two-column templates, to the opposite side. Reading order does not change." })));
  struct.append(flip);
  if (letter) {
    const date = h("label", { class: "check design__flip" });
    const dateInput = h("input", { type: "checkbox", class: "check__input" });
    dateInput.checked = design.dateAlign === "right";
    dateInput.dataset.focusKey = "design:dateAlign";
    dateInput.addEventListener("change", () => ctx.change(() => (dateInput.checked ? (doc.designSettings.dateAlign = "right") : delete doc.designSettings.dateAlign), { structural: true, focusKey: "design:dateAlign" }));
    date.append(dateInput, h("span", {}, h("strong", { text: "Date on the right" }), h("small", { text: "Aligns the date to the right edge, as in many business letters." })));
    struct.append(date);
  }
  struct.append(
    h("p", { class: "field__label", text: "Paper size" }),
    segmented("dz-paper", Object.entries(PAPER).map(([k, v]) => [k, v.label.split(" (")[0]]), doc.pageSize, (v) => ctx.change(() => (doc.pageSize = v), { structural: false }), { label: "Paper size" }),
  );
  root.append(struct);

  // ---- move blocks ----
  const move = group("move", "dz-move", "Move blocks");
  move.append(moveCard({ doc, ctx, block, onBlock }).el);
  root.append(move);

  // ---- photo ----
  const photo = photoControls({ doc, ctx, headingId: "dz-photo", level: "h3" });
  photo.id = "dg-photo";
  if (doc.photo) {
    const spinner = (key) => {
      const lim = PHOTO_LIMITS[key];
      const id = nid("rng");
      const live = doc.designSettings[key];
      const shown = live ?? (key === "photoSize" ? Math.round((document.querySelector(".stage__sizer [data-role='photo']")?.offsetWidth || 90) / 3.7795) : 0);
      const fmt = (v) => `${v} mm`;
      const out = h("output", { for: id, text: fmt(shown) });
      const input = h("input", { type: "range", id, class: "range", min: String(lim.min), max: String(lim.max), step: String(lim.step) });
      input.value = String(Math.min(lim.max, Math.max(lim.min, shown)));
      input.addEventListener("input", () => {
        const v = Number(input.value);
        out.textContent = fmt(v);
        input.setAttribute("aria-valuetext", fmt(v));
        set(key, v);
        photoReset.disabled = false;
      });
      return h("div", { class: "slider" }, h("label", { for: id, text: lim.label }), out, input);
    };
    const photoReset = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Reset size and position", disabled: !["photoSize", "photoX", "photoY"].some((k) => doc.designSettings[k] !== undefined) });
    photoReset.addEventListener("click", () => ctx.change(() => ["photoSize", "photoX", "photoY"].forEach((k) => delete doc.designSettings[k]), { structural: true, focusKey: "design:photo-reset" }));
    photoReset.dataset.focusKey = "design:photo-reset";
    photo.append(h("h4", { class: "design__sub", text: "Resize and move" }), spinner("photoSize"), spinner("photoX"), spinner("photoY"), h("p", { class: "field__hint", text: "Nudging moves the photo without moving the text, so check the preview before you export." }), photoReset);
  }
  root.append(photo);

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

