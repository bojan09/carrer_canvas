import { h } from "../utils/dom.js";
import { renderDocument } from "../preview/render.js";
import { ELEMENT_LIMITS, ELEMENT_ROLES, FONT_FAMILIES, WEIGHTS, contrastRatio, effectiveFill, mixHex, renderTemplateOf, resolveDesign } from "../templates/design.js";
import { isLetter } from "../models/cover-letter.js";

/** "Format text": formats one kind of text (name, headings, body ...) for the whole document.
 *  Every control writes into designSettings.elements[role]; "Template default" simply removes the override. */

let uid = 0;
const nid = (p) => `${p}-${++uid}`;

const rgbToHex = (rgb) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || "");
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : "#000000";
};

/** What a template does by default for each kind of text, measured from a real off-screen render of the sample.
 *  Cached per template and global design, so changing a single element never needs a new measurement. */
const cache = new Map();
export function templateDefaults(doc, sampleDoc) {
  const design = { ...doc.designSettings };
  delete design.elements;
  delete design.moves;
  const key = `${doc.kind || "resume"}|${doc.templateId}|${JSON.stringify(design)}`;
  if (cache.has(key)) return cache.get(key);
  const probe = { ...sampleDoc, templateId: doc.templateId, pageSize: doc.pageSize, designSettings: { ...design, showPhoto: false } };
  const host = h("div", { "aria-hidden": "true" });
  for (const [k, v] of Object.entries({ position: "fixed", left: "-10000px", top: "0", visibility: "hidden", "pointer-events": "none" })) host.style.setProperty(k, v);
  const el = renderDocument(probe);
  host.append(el);
  document.body.append(host);
  const out = {};
  for (const role of Object.keys(ELEMENT_ROLES)) {
    const node = el.querySelector(`[data-role="${role}"]`);
    if (!node) continue;
    const cs = getComputedStyle(node);
    const px = parseFloat(cs.fontSize);
    out[role] = {
      color: rgbToHex(cs.color),
      size: Math.round((px * 0.75) * 2) / 2,
      weight: Math.min(900, Math.max(400, Math.round(Number(cs.fontWeight) / 100) * 100)),
      italic: cs.fontStyle === "italic",
      upper: cs.textTransform === "uppercase",
      track: Math.round((parseFloat(cs.letterSpacing) || 0) / px * 100) / 100,
      align: ["left", "center", "right", "justify"].includes(cs.textAlign) ? cs.textAlign : "left",
    };
  }
  host.remove();
  cache.set(key, out);
  return out;
}

/** Background the text sits on, for readability hints. Header text on coloured headers sits on the fill. */
function backdrop(doc, role) {
  const tpl = renderTemplateOf(doc);
  const d = resolveDesign(doc);
  if (tpl.headerInk && ["name", "role", "contact"].includes(role)) return mixHex(effectiveFill(tpl, d), tpl.paperBg, d.fillOpacity);
  return tpl.paperBg;
}

export function formatCard({ doc, ctx, role, onRole, sample }) {
  const letter = isLetter(doc);
  const roles = Object.entries(ELEMENT_ROLES).filter(([r]) => !(letter && r === "heading"));
  if (!roles.some(([r]) => r === role)) role = "body";
  const spec = ELEMENT_ROLES[role];
  const defaults = templateDefaults(doc, sample())[role] || { color: "#000000", size: 11, weight: 400, italic: false, upper: false, track: 0, align: "left" };
  const current = () => doc.designSettings.elements?.[role] || {};

  const write = (prop, value, opts = {}) =>
    ctx.change(
      () => {
        const els = (doc.designSettings.elements ||= {});
        const el = (els[role] ||= {});
        if (value === undefined) delete el[prop];
        else el[prop] = value;
        if (!Object.keys(el).length) delete els[role];
        if (!Object.keys(els).length) delete doc.designSettings.elements;
      },
      { group: `el.${role}.${prop}`, ...opts },
    );
  /** Rebuild only this card after a reset, so controls show the template values again. */
  const rebuild = () => onRole(role, { focus: true });
  const resetProp = (prop, key) => write(prop, undefined, { structural: true, focusKey: key });

  const root = h("div", { class: "format", role: "group", "aria-labelledby": "format-h" });
  root.append(h("h4", { id: "format-h", class: "format__title", text: "Format text" }), h("p", { class: "field__hint", text: "Changes apply to every piece of text of that kind, so your document stays consistent. Click any text in the preview to pick it." }));

  // ---- which text ----
  const chips = h("div", { class: "format__chips", role: "radiogroup", "aria-label": "Text to format" });
  for (const [r, s] of roles) {
    const b = h("button", { type: "button", class: "chip-btn", role: "radio", "aria-checked": String(r === role), text: s.label, title: s.hint });
    b.dataset.focusKey = `format:role:${r}`;
    b.addEventListener("click", () => onRole(r, { focus: false }));
    chips.append(b);
  }
  root.append(chips);
  root.append(h("p", { class: "format__editing" }, document.createTextNode("Editing: "), h("strong", { text: spec.label }), document.createTextNode(` · ${spec.hint}`)));

  const field = (label, control, extra) => h("div", { class: "format__field" }, h("label", { class: "field__label", for: control.id, text: label }), control, extra || null);
  const resetBtn = (prop, key, active) => {
    const b = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Template default", disabled: !active });
    b.setAttribute("aria-label", `Template default for ${spec.label.toLowerCase()}, ${prop}`);
    b.addEventListener("click", () => resetProp(prop, key));
    return b;
  };

  const grid = h("div", { class: "format__grid" });

  // font
  const fontSel = h("select", { id: nid("fm"), class: "input input--select" });
  fontSel.append(h("option", { value: "", text: "Template default" }));
  for (const group of ["Sans-serif", "Serif", "Monospace"]) {
    const og = h("optgroup", { label: group });
    for (const [id, f] of Object.entries(FONT_FAMILIES)) if (f.group === group) og.append(h("option", { value: id, text: f.label }));
    fontSel.append(og);
  }
  fontSel.value = current().font || "";
  fontSel.dataset.focusKey = "format:font";
  fontSel.addEventListener("change", () => write("font", fontSel.value || undefined, { structural: true, focusKey: "format:font" }));
  grid.append(field("Font", fontSel));

  // weight
  const weightSel = h("select", { id: nid("fm"), class: "input input--select" });
  weightSel.append(h("option", { value: "", text: `Template default (${WEIGHTS.find(([w]) => w === defaults.weight)?.[1] || "Regular"})` }));
  for (const [w, label] of WEIGHTS) weightSel.append(h("option", { value: String(w), text: label }));
  weightSel.value = current().weight ? String(current().weight) : "";
  weightSel.dataset.focusKey = "format:weight";
  weightSel.addEventListener("change", () => write("weight", weightSel.value ? Number(weightSel.value) : undefined, { structural: true, focusKey: "format:weight" }));
  grid.append(field("Boldness", weightSel));

  // size
  const sizeId = nid("fm");
  const sizeLim = ELEMENT_LIMITS.size;
  const size = current().size ?? defaults.size;
  const sizeOut = h("output", { for: sizeId, text: `${size} pt` });
  const sizeIn = h("input", { type: "range", id: sizeId, class: "range", min: String(sizeLim.min), max: String(sizeLim.max), step: String(sizeLim.step) });
  sizeIn.value = String(size);
  sizeIn.setAttribute("aria-valuetext", `${size} points`);
  sizeIn.addEventListener("input", () => {
    const v = Number(sizeIn.value);
    sizeOut.textContent = `${v} pt`;
    sizeIn.setAttribute("aria-valuetext", `${v} points`);
    write("size", v);
  });
  grid.append(h("div", { class: "format__field format__field--wide" }, h("div", { class: "slider" }, h("label", { for: sizeId, text: "Size" }), sizeOut, sizeIn), resetBtn("size", "format:size", current().size !== undefined)));

  // colour
  const colourId = nid("fm");
  const colour = h("input", { type: "color", id: colourId, class: "colour__input", value: current().color || defaults.color });
  colour.dataset.focusKey = "format:color";
  const note = h("p", { class: "field__hint", role: "status" });
  const paint = (hex) => {
    const ratio = contrastRatio(hex, backdrop(doc, role));
    note.textContent = `Contrast: ${ratio.toFixed(1)}:1.${ratio < 4.5 ? " Low, so this text may be hard to read." : ""}`;
    note.classList.toggle("is-warn", ratio < 4.5);
  };
  paint(colour.value);
  colour.addEventListener("input", () => {
    write("color", colour.value.toLowerCase());
    paint(colour.value);
  });
  grid.append(field("Colour", h("div", { class: "colour__row" }, colour, resetBtn("colour", "format:color", current().color !== undefined)), note));
  // field() points its label at the first child: the colour row. Point it at the input itself.
  grid.lastChild.querySelector("label").setAttribute("for", colourId);

  // capitals
  const capSel = h("select", { id: nid("fm"), class: "input input--select" });
  capSel.append(h("option", { value: "", text: `Template default (${defaults.upper ? "capitals" : "normal"})` }), h("option", { value: "on", text: "ALL CAPITALS" }), h("option", { value: "off", text: "Normal case" }));
  capSel.value = current().upper === true ? "on" : current().upper === false ? "off" : "";
  capSel.dataset.focusKey = "format:upper";
  capSel.addEventListener("change", () => write("upper", capSel.value === "" ? undefined : capSel.value === "on", { structural: true, focusKey: "format:upper" }));
  grid.append(field("Capitals", capSel));

  // italic
  const italic = h("input", { type: "checkbox", class: "check__input", id: nid("fm") });
  italic.checked = current().italic ?? defaults.italic;
  italic.dataset.focusKey = "format:italic";
  italic.addEventListener("change", () => write("italic", italic.checked === defaults.italic ? undefined : italic.checked, { structural: true, focusKey: "format:italic" }));
  grid.append(h("div", { class: "format__field" }, h("label", { class: "check", for: italic.id }, italic, h("span", { text: "Italic" }))));

  // letter spacing
  const trackId = nid("fm");
  const trackLim = ELEMENT_LIMITS.track;
  const track = current().track ?? defaults.track;
  const trackOut = h("output", { for: trackId, text: track.toFixed(2) });
  const trackIn = h("input", { type: "range", id: trackId, class: "range", min: String(trackLim.min), max: String(trackLim.max), step: String(trackLim.step) });
  trackIn.value = String(track);
  trackIn.addEventListener("input", () => {
    const v = Number(trackIn.value);
    trackOut.textContent = v.toFixed(2);
    trackIn.setAttribute("aria-valuetext", `${v.toFixed(2)} em`);
    write("track", v);
  });
  grid.append(h("div", { class: "format__field format__field--wide" }, h("div", { class: "slider" }, h("label", { for: trackId, text: "Letter spacing" }), trackOut, trackIn), resetBtn("track", "format:track", current().track !== undefined)));

  // alignment
  if (spec.align) {
    const opts = [["left", "Left"], ["center", "Centre"], ["right", "Right"], ...(spec.justify ? [["justify", "Justify"]] : [])];
    const seg = h("div", { class: "segmented", role: "radiogroup", "aria-label": `${spec.label} alignment` });
    const name = nid("al");
    const active = current().align ?? defaults.align;
    for (const [v, text] of opts) {
      const input = h("input", { type: "radio", name, value: v });
      input.checked = v === active;
      input.addEventListener("change", () => input.checked && write("align", v, { structural: true, focusKey: "format:align" }));
      seg.append(h("label", { class: "segmented__option" }, input, h("span", { class: "segmented__label", text })));
    }
    seg.dataset.focusKey = "format:align";
    grid.append(h("div", { class: "format__field format__field--wide" }, h("p", { class: "field__label", text: "Alignment" }), seg, resetBtn("align", "format:align", current().align !== undefined)));
  }
  root.append(grid);

  // ---- whole-element actions ----
  const reset = h("button", { type: "button", class: "btn btn--outline btn--sm", text: `Reset ${spec.label.toLowerCase()}`, disabled: !Object.keys(current()).length });
  reset.dataset.focusKey = "format:reset";
  reset.addEventListener("click", () => {
    ctx.change(
      () => {
        if (doc.designSettings.elements) {
          delete doc.designSettings.elements[role];
          if (!Object.keys(doc.designSettings.elements).length) delete doc.designSettings.elements;
        }
      },
      { structural: true, focusKey: "format:reset" },
    );
    ctx.announce(`${spec.label} reset to the template look.`);
  });
  const everywhere = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Use this font for all text", disabled: !current().font });
  everywhere.addEventListener("click", () => {
    const font = current().font;
    ctx.change(
      () => {
        const els = (doc.designSettings.elements ||= {});
        for (const [r] of roles) (els[r] ||= {}).font = font;
      },
      { structural: true, focusKey: "format:reset" },
    );
    ctx.announce("That font is now used for all text.");
  });
  root.append(h("div", { class: "format__actions" }, reset, everywhere));
  return root;
}
