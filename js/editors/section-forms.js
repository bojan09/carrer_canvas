import { h } from "../utils/dom.js";
import { CONTACT_FIELDS, SECTION_DEFS } from "../models/section-defs.js";
import { emptyItem, emptyLink, newId } from "../models/resume.js";
import { validateRange } from "../utils/validation.js";
import { cleanText } from "../utils/sanitization.js";
import { confirmDialog } from "../components/dialog.js";
import { checkboxField, iconButton, textField } from "./fields.js";
import { bulletsEditor } from "./bullets.js";
import { photoControls } from "./photo-controls.js";
import { makeSortable } from "./sortable.js";

const move = (arr, from, to) => {
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
};

/** Contact fields + extra links. */
export function contactBody(doc, ctx) {
  const grid = h("div", { class: "fields" });
  for (const f of CONTACT_FIELDS) {
    const field = textField({
      label: f.label,
      value: doc.contact[f.key],
      type: f.type || "text",
      max: f.max,
      hint: f.hint,
      autocomplete: f.autocomplete,
      inputmode: f.inputmode,
      validate: f.validate,
      full: f.key === "fullName" || f.key === "location",
      onInput: (v) => ctx.change(() => (doc.contact[f.key] = cleanText(v, f.max)), { group: `contact.${f.key}` }),
    });
    field.input.dataset.focusKey = `contact:${f.key}`;
    grid.append(field.root);
  }

  const links = h("div", { class: "links" }, h("p", { class: "field__label", text: "Additional links" }));
  links.append(h("p", { class: "field__hint", text: "Portfolio pieces, GitHub or anything else a reader should open. Only web links (http or https) are used." }));
  doc.links.forEach((link, i) => {
    const label = textField({
      label: `Link ${i + 1} label`,
      value: link.label,
      max: 60,
      placeholder: "e.g. GitHub",
      onInput: (v) => ctx.change(() => (link.label = cleanText(v, 60)), { group: `link.${link.id}.label` }),
    });
    const url = textField({
      label: `Link ${i + 1} address`,
      value: link.url,
      type: "url",
      max: 300,
      validate: "url",
      onInput: (v) => ctx.change(() => (link.url = cleanText(v, 300)), { group: `link.${link.id}.url` }),
    });
    label.input.dataset.focusKey = `link:${link.id}:label`;
    links.append(
      h(
        "div",
        { class: "link-row" },
        label.root,
        url.root,
        iconButton({
          name: "trash",
          label: `Remove link ${i + 1}`,
          onClick: () => {
            ctx.change(() => doc.links.splice(i, 1), { structural: true, focusKey: "links:add" });
            ctx.announce("Link removed. You can undo.");
          },
        }),
      ),
    );
  });
  if (doc.links.length < 10) {
    links.append(
      iconButton({
        name: "plus",
        text: "Add link",
        label: "Add link",
        variant: "outline",
        focusKey: "links:add",
        onClick: () => {
          const l = emptyLink();
          ctx.change(() => doc.links.push(l), { structural: true, focusKey: `link:${l.id}:label` });
        },
      }),
    );
  }
  return h("div", {}, photoControls({ doc, ctx, headingId: "pi-photo", level: "h4" }), grid, links);
}

export function summaryBody(section, def, ctx) {
  const f = textField({
    label: "Summary",
    value: section.text,
    type: "textarea",
    rows: 6,
    max: def.max,
    hint: def.hint,
    full: true,
    onInput: (v) => ctx.change(() => (section.text = cleanText(v, def.max, { multiline: true })), { group: `${section.id}.text` }),
  });
  f.input.dataset.focusKey = `${section.id}:text`;
  return f.root;
}

function entryCard(section, def, item, index, ctx) {
  const list = section.items;
  const refs = {};
  const fieldsEl = h("div", { class: "fields" });
  const title = h("h4", { class: "entry__title" });
  const refreshTitle = () => {
    title.textContent = def.summary(item) || `New ${def.itemLabel}`;
  };
  refreshTitle();

  def.fields.forEach((f, fi) => {
    if (f.type === "bullets") {
      fieldsEl.append(bulletsEditor({ field: f, bullets: item[f.key], ctx, ownerId: item.id }));
      return;
    }
    if (f.type === "checkbox") {
      const c = checkboxField({
        label: f.label,
        checked: item[f.key],
        onChange: (v) => {
          ctx.change(() => (item[f.key] = v), { structural: false });
          const dependent = def.fields.find((d) => d.disabledWhen === f.key);
          if (dependent && refs[dependent.key]) {
            refs[dependent.key].input.disabled = v;
            refs[dependent.key].check();
          }
        },
      });
      refs[f.key] = c;
      fieldsEl.append(c.root);
      return;
    }
    const isEnd = f.key === "endDate";
    const field = textField({
      label: f.label,
      value: f.type === "tags" ? (item[f.key] || []).join(", ") : item[f.key],
      type: f.type || "text",
      max: f.max,
      hint: f.hint,
      autocomplete: f.autocomplete,
      placeholder: f.placeholder,
      validate: f.validate,
      list: f.list,
      rows: f.type === "tags" ? 2 : 3,
      full: Boolean(f.full),
      disabled: f.disabledWhen ? Boolean(item[f.disabledWhen]) : false,
      extraError: isEnd ? () => validateRange(item.startDate, item.endDate, item.current) : undefined,
      onInput: (v) => {
        ctx.change(
          () => {
            item[f.key] =
              f.type === "tags"
                ? v.split(/[,\n]/).map((t) => cleanText(t, 80).trim()).filter(Boolean).slice(0, 60)
                : cleanText(v, f.max || 200, { multiline: f.type === "textarea" });
          },
          { group: `${item.id}.${f.key}` },
        );
        refreshTitle();
        if (f.key === "startDate" && refs.endDate) refs.endDate.check();
      },
    });
    if (fi === 0) field.input.dataset.focusKey = `entry:${item.id}:first`;
    refs[f.key] = field;
    fieldsEl.append(field.root);
  });

  const key = (a) => `entry:${item.id}:${a}`;
  const reorder = (delta) => () => {
    const to = index + delta;
    ctx.change(() => move(list, index, to), { structural: true, focusKey: key(delta < 0 ? "up" : "down") });
    ctx.announce(`${def.label} entry moved to position ${to + 1} of ${list.length}.`);
  };

  const grip = h("span", { class: "grip", "aria-hidden": "true", title: "Drag to reorder (mouse)" });
  grip.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-grip"></use></svg>';

  const li = h(
    "li",
    { class: "entry", "data-entry-id": item.id },
    h(
      "div",
      { class: "entry__head" },
      grip,
      title,
      h(
        "div",
        { class: "entry__tools" },
        iconButton({ name: "arrow-up", label: `Move ${def.itemLabel} ${index + 1} up`, onClick: reorder(-1), focusKey: key("up"), disabled: index === 0 }),
        iconButton({ name: "arrow-down", label: `Move ${def.itemLabel} ${index + 1} down`, onClick: reorder(1), focusKey: key("down"), disabled: index === list.length - 1 }),
        iconButton({
          name: "copy",
          label: `Duplicate ${def.itemLabel} ${index + 1}`,
          onClick: () => {
            const copy = structuredClone(item);
            copy.id = newId();
            for (const f of def.fields) if (f.type === "bullets") copy[f.key] = copy[f.key].map((b) => ({ ...b, id: newId() }));
            ctx.change(() => list.splice(index + 1, 0, copy), { structural: true, focusKey: `entry:${copy.id}:first` });
            ctx.announce(`${def.itemLabel} duplicated.`);
          },
        }),
        iconButton({
          name: "trash",
          label: `Delete ${def.itemLabel} ${index + 1}`,
          onClick: async () => {
            const ok = await confirmDialog({
              title: `Delete this ${def.itemLabel}?`,
              message: "It will be removed from your resume. You can bring it back with Undo.",
              confirmLabel: "Delete",
              danger: true,
            });
            if (!ok) return;
            ctx.change(() => list.splice(index, 1), { structural: true, focusKey: `${section.id}:add` });
            ctx.announce(`${def.itemLabel} deleted. You can undo.`);
          },
        }),
      ),
    ),
    fieldsEl,
  );
  return li;
}

export function entriesBody(section, def, ctx) {
  const wrap = h("div", {});
  if (def.hint) wrap.append(h("p", { class: "field__hint field__hint--section", text: def.hint }));
  const list = h("ol", { class: "entries" });
  section.items.forEach((item, i) => list.append(entryCard(section, def, item, i, ctx)));
  wrap.append(list);
  makeSortable(list, {
    itemSelector: ".entry",
    handleSelector: ".grip",
    onMove: (from, to) => {
      ctx.change(() => move(section.items, from, to), { structural: true });
      ctx.announce(`${def.label} entry moved to position ${to + 1} of ${section.items.length}.`);
    },
  });
  wrap.append(
    iconButton({
      name: "plus",
      text: `Add ${def.itemLabel}`,
      label: `Add ${def.itemLabel}`,
      variant: "outline",
      focusKey: `${section.id}:add`,
      onClick: () => {
        const item = emptyItem(section.type);
        ctx.change(() => section.items.push(item), { structural: true, focusKey: `entry:${item.id}:first` });
      },
    }),
  );
  return wrap;
}

export function customBody(section, ctx) {
  const wrap = h("div", {});
  const title = textField({
    label: "Section heading",
    value: section.title,
    max: 80,
    full: true,
    onInput: (v) => ctx.change(() => (section.title = cleanText(v, 80)), { group: `${section.id}.title` }),
  });
  title.input.dataset.focusKey = `${section.id}:title`;

  const modeName = `mode-${section.id}`;
  const modes = h(
    "fieldset",
    { class: "mode" },
    h("legend", { class: "field__label", text: "Content type" }),
    h(
      "div",
      { class: "segmented" },
      ...[
        ["text", "Paragraph"],
        ["bullets", "Bullet list"],
      ].map(([value, label]) => {
        const input = h("input", { type: "radio", name: modeName, value });
        input.checked = section.mode === value;
        input.addEventListener("change", () => ctx.change(() => (section.mode = value), { structural: true, focusKey: `${section.id}:title` }));
        return h("label", { class: "segmented__option" }, input, h("span", { class: "segmented__label", text: label }));
      }),
    ),
  );

  wrap.append(title.root, modes);
  if (section.mode === "bullets") {
    wrap.append(bulletsEditor({ field: { key: "bullets", label: "Items", max: 400 }, bullets: section.bullets, ctx, ownerId: section.id }));
  } else {
    const text = textField({
      label: "Text",
      value: section.text,
      type: "textarea",
      rows: 5,
      max: 3000,
      full: true,
      onInput: (v) => ctx.change(() => (section.text = cleanText(v, 3000, { multiline: true })), { group: `${section.id}.text` }),
    });
    wrap.append(text.root);
  }
  return wrap;
}

export function sectionBody(section, ctx) {
  const def = SECTION_DEFS[section.type];
  if (def.kind === "text") return summaryBody(section, def, ctx);
  if (def.kind === "custom") return customBody(section, ctx);
  return entriesBody(section, def, ctx);
}
