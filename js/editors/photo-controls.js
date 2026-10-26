import { h } from "../utils/dom.js";
import { announce } from "../components/announcer.js";
import { toast } from "../components/toast.js";
import { photoVisible, renderTemplateOf, resolveDesign } from "../templates/design.js";
import { compressPhoto, PHOTO_ERRORS, PHOTO_TYPES } from "./photo.js";

let uid = 0;

/** Photo upload/show/remove controls. Used in Personal Info and in the Design tab.
 *  A photo is stored locally and is drawn only while "Show photo" is on AND the layout supports it. */
export function photoControls({ doc, ctx, headingId = "photo-h", level = "h3" }) {
  const design = resolveDesign(doc);
  const rendered = renderTemplateOf(doc);
  const set = (key, value) => ctx.change(() => (doc.designSettings[key] = value), { group: `design.${key}` });
  const idf = `photo-file-${++uid}`;

  const section = h("section", { class: "design__group photo", "aria-labelledby": headingId }, h(level, { id: headingId, text: "Photo (optional)" }));
  section.append(h("p", { class: "field__hint", text: "Photos are never required. Some regions, employers and applicant systems discourage or ignore them, and a photo can make a resume less ATS-friendly. It stays on this device and appears on the resume only while “Show photo” is on." }));

  const fileInput = h("input", { type: "file", class: "sr-only", accept: PHOTO_TYPES.join(","), id: idf, tabindex: "-1" });
  const choose = h("button", { type: "button", class: "btn btn--outline btn--sm", text: doc.photo ? "Replace photo…" : "Add a photo…" });
  choose.dataset.focusKey = "design:photo-choose";
  choose.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const result = await compressPhoto(file);
      ctx.change(
        () => {
          doc.photo = result;
          if (doc.designSettings.showPhoto === undefined) doc.designSettings.showPhoto = true; // adding a photo means you want to see it
        },
        { structural: true, focusKey: "design:photo-show" },
      );
      const shown = photoVisible(doc);
      toast({ message: shown ? "Photo added and shown on the resume." : `Photo added. ${renderTemplateOf(doc).name} does not show photos, so choose another template to see it.`, tone: shown ? "ok" : "warn" });
    } catch (err) {
      toast({ message: PHOTO_ERRORS[err.message] || "Could not use that photo.", tone: "warn", duration: 7000 });
    }
  });
  section.append(choose, fileInput);

  if (doc.photo) {
    const preview = h("img", { class: "design__photo", src: doc.photo.data, alt: "Your photo (preview)", width: "56", height: "56" });
    const show = h("label", { class: "check" });
    const showInput = h("input", { type: "checkbox", class: "check__input" });
    showInput.checked = design.showPhoto;
    showInput.dataset.focusKey = "design:photo-show";
    showInput.addEventListener("change", () => ctx.change(() => (doc.designSettings.showPhoto = showInput.checked), { structural: true, focusKey: "design:photo-show" }));
    show.append(showInput, h("span", { text: "Show photo on resume" }));
    const remove = h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger-text", text: "Remove photo" });
    remove.addEventListener("click", () => {
      ctx.change(
        () => {
          doc.photo = null;
          delete doc.designSettings.showPhoto;
        },
        { structural: true, focusKey: "design:photo-choose" },
      );
      announce("Photo removed. You can undo.");
    });
    section.append(h("div", { class: "design__photorow" }, preview, show, remove));

    const shape = h("div", { class: "segmented", role: "radiogroup", "aria-label": "Photo shape" });
    for (const [v, label] of [["circle", "Round"], ["square", "Square"]]) {
      const input = h("input", { type: "radio", name: `shape-${idf}`, value: v });
      input.checked = design.photoShape === v;
      input.addEventListener("change", () => input.checked && set("photoShape", v));
      shape.append(h("label", { class: "segmented__option" }, input, h("span", { class: "segmented__label", text: label })));
    }
    section.append(shape);

    if (design.showPhoto && design.simplified) {
      section.append(h("p", { class: "notice notice--warn", text: "Simplified layout never shows a photo. Turn it off in the Design tab to show your photo." }));
    } else if (design.showPhoto && !rendered.supports.photo) {
      section.append(h("p", { class: "notice notice--warn", text: `${rendered.name} does not show photos. Choose another template in the Design tab to include yours.` }));
    }
  }
  return section;
}
