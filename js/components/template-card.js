import { h } from "../utils/dom.js";
import { createSample } from "../models/resume.js";
import { mountThumb } from "../preview/thumb.js";

let sample = null;
export const sampleResume = () => (sample ||= createSample());

/** Card with a real, locally rendered thumbnail. `mode: "link"` makes the whole card a link (Home);
 *  otherwise it shows Preview / Use template buttons (gallery). Returns {el, destroy}. */
export function createTemplateCard(t, { mode = "gallery", href = "#/templates", onPreview, onUse } = {}) {
  const frame = h("div", {});
  const destroy = mountThumb(frame, sampleResume(), t.id);
  const badges = [...t.tags.map((b) => h("span", { class: `badge badge--${b.tone}`, text: b.label })), h("span", { class: "badge badge--muted", text: "Sample content" })];
  const meta = h("div", { class: "template-card__meta" }, h("h3", { class: "template-card__name", text: t.name }), h("p", { class: "template-card__blurb", text: t.blurb }), h("div", { class: "template-card__tags" }, badges));

  if (mode === "link") {
    return { el: h("a", { class: "template-card", href, "aria-label": `${t.name} template` }, frame, meta), destroy };
  }

  const preview = h("button", { type: "button", class: "btn btn--outline btn--sm", text: "Preview", "aria-label": `Preview ${t.name}` });
  const use = h("button", { type: "button", class: "btn btn--primary btn--sm", text: "Use template", "aria-label": `Use ${t.name} template` });
  preview.addEventListener("click", () => onPreview?.(t));
  use.addEventListener("click", () => onUse?.(t));
  meta.append(h("div", { class: "template-card__actions" }, preview, use));
  return { el: h("article", { class: "template-card" }, frame, meta), destroy };
}
