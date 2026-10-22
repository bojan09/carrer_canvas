import { h, icon } from "../utils/dom.js";
import { SECTION_DEFS } from "../models/section-defs.js";
import { emptyCustomSection } from "../models/resume.js";
import { openDialog } from "../components/dialog.js";
import { iconButton } from "./fields.js";
import { makeSortable } from "./sortable.js";
import { titleOf } from "./hints.js";

const move = (arr, from, to) => {
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
};

/** Section navigator + ordering. Used as the left rail on wide screens and inside a dialog elsewhere.
 *  Ordering works with drag (mouse) and with the up/down buttons (keyboard, touch, screen readers). */
export function sectionsList({ session, ctx, onNavigate }) {
  const doc = session.doc;
  const root = h("div", { class: "rail" });
  const list = h("ol", { class: "rail__list" });

  const link = (id, label, iconName) => {
    const btn = h("button", { type: "button", class: "rail__link", onclick: () => onNavigate(id) });
    btn.innerHTML = icon(iconName);
    btn.append(h("span", { text: label }));
    return btn;
  };

  // Personal Info is always first and cannot be moved or hidden
  list.append(h("li", { class: "rail__item rail__item--fixed" }, link("contact", "Personal Info", "user")));

  const sortable = h("ol", { class: "rail__list rail__list--sortable" });
  doc.sectionOrder.forEach((id, index) => {
    const section = doc.sections[id];
    const label = titleOf(section);
    const grip = h("span", { class: "grip", "aria-hidden": "true", title: "Drag to reorder (mouse)" });
    grip.innerHTML = icon("grip");
    const li = h(
      "li",
      { class: `rail__item${section.visible ? "" : " is-hidden"}` },
      grip,
      link(id, label, SECTION_DEFS[section.type].icon),
      h(
        "div",
        { class: "rail__tools" },
        iconButton({
          name: section.visible ? "eye" : "eye-off",
          label: `${section.visible ? "Hide" : "Show"} ${label} ${section.visible ? "from" : "on"} resume`,
          pressed: !section.visible,
          focusKey: `rail:${id}:vis`,
          onClick: () => {
            ctx.change(() => (section.visible = !section.visible), { structural: true, focusKey: `rail:${id}:vis` });
            ctx.announce(`${label} ${section.visible ? "shown" : "hidden"}.`);
          },
        }),
        iconButton({
          name: "arrow-up",
          label: `Move ${label} up`,
          focusKey: `rail:${id}:up`,
          disabled: index === 0,
          onClick: () => {
            ctx.change(() => move(doc.sectionOrder, index, index - 1), { structural: true, focusKey: `rail:${id}:up` });
            ctx.announce(`${label} moved to position ${index} of ${doc.sectionOrder.length}.`);
          },
        }),
        iconButton({
          name: "arrow-down",
          label: `Move ${label} down`,
          focusKey: `rail:${id}:down`,
          disabled: index === doc.sectionOrder.length - 1,
          onClick: () => {
            ctx.change(() => move(doc.sectionOrder, index, index + 1), { structural: true, focusKey: `rail:${id}:down` });
            ctx.announce(`${label} moved to position ${index + 2} of ${doc.sectionOrder.length}.`);
          },
        }),
      ),
    );
    sortable.append(li);
  });
  makeSortable(sortable, {
    itemSelector: ".rail__item",
    handleSelector: ".grip",
    onMove: (from, to) => {
      ctx.change(() => move(doc.sectionOrder, from, to), { structural: true });
      ctx.announce(`Section moved to position ${to + 1} of ${doc.sectionOrder.length}.`);
    },
  });

  root.append(list, sortable);

  const add = iconButton({
    name: "plus",
    text: "Add section",
    label: "Add section",
    variant: "outline",
    focusKey: "rail:add",
    onClick: async () => {
      const body = h("div", { class: "fields" });
      const titleInput = h("input", { class: "input", type: "text", maxlength: "80", id: "new-sec-title", placeholder: "e.g. Volunteering" });
      body.append(
        h("p", { text: "Add a custom section for anything else that supports your application." }),
        h("label", { class: "field__label", for: "new-sec-title", text: "Section heading" }),
        titleInput,
      );
      const title = await openDialog({
        title: "Add a section",
        body,
        initialFocus: "#new-sec-title",
        actions: [
          { label: "Cancel", value: null, variant: "outline" },
          { label: "Add section", value: () => titleInput.value.trim() || "Custom section", variant: "primary" },
        ],
      });
      if (!title) return;
      const section = emptyCustomSection(title);
      ctx.change(
        () => {
          doc.sections[section.id] = section;
          doc.sectionOrder.push(section.id);
        },
        { structural: true, focusKey: `${section.id}:title`, expand: section.id },
      );
      ctx.announce(`${title} section added.`);
    },
  });
  root.append(add);
  return root;
}
