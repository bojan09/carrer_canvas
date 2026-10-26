import { h } from "../utils/dom.js";
import { emptyBullet } from "../models/resume.js";
import { iconButton } from "./fields.js";

/** Repeatable single-bullet editor. `bullets` is the live array inside the document. */
export function bulletsEditor({ field, bullets, ctx, ownerId }) {
  const wrap = h("div", { class: "bullets field--full" });
  const heading = h("p", { class: "field__label", id: `${ownerId}-${field.key}-label`, text: field.label });
  const list = h("ol", { class: "bullets__list", "aria-labelledby": heading.id });
  wrap.append(heading);
  if (field.hint) wrap.append(h("p", { class: "field__hint", text: field.hint }));
  wrap.append(list);

  const keyFor = (b, action) => `bullet:${b.id}:${action}`;

  bullets.forEach((bullet, index) => {
    const area = h("textarea", {
      class: "input input--bullet",
      rows: "2",
      maxlength: String(field.max || 400),
      "aria-label": `${field.label}, item ${index + 1} of ${bullets.length}`,
      "data-focus-key": keyFor(bullet, "text"),
    });
    area.value = bullet.text;
    area.addEventListener("input", () => {
      ctx.change(() => (bullet.text = area.value), { group: `bullet:${bullet.id}` });
    });

    const move = (delta) => () => {
      const to = index + delta;
      ctx.change(
        () => {
          const [item] = bullets.splice(index, 1);
          bullets.splice(to, 0, item);
        },
        { structural: true, focusKey: keyFor(bullet, delta < 0 ? "up" : "down") },
      );
      ctx.announce(`Moved to position ${to + 1} of ${bullets.length}.`);
    };

    list.append(
      h(
        "li",
        { class: "bullets__item", "data-flip-key": `bullet:${bullet.id}` },
        area,
        h(
          "div",
          { class: "bullets__tools" },
          iconButton({ name: "arrow-up", label: `Move item ${index + 1} up`, onClick: move(-1), focusKey: keyFor(bullet, "up"), disabled: index === 0 }),
          iconButton({ name: "arrow-down", label: `Move item ${index + 1} down`, onClick: move(1), focusKey: keyFor(bullet, "down"), disabled: index === bullets.length - 1 }),
          iconButton({
            name: "trash",
            label: `Remove item ${index + 1}`,
            onClick: () => {
              ctx.change(() => bullets.splice(index, 1), {
                structural: true,
                focusKey: bullets[index + 1] ? keyFor(bullets[index + 1], "text") : `${ownerId}:add-bullet`,
              });
              ctx.undoable("Item removed.");
            },
          }),
        ),
      ),
    );
  });

  const add = iconButton({
    name: "plus",
    text: bullets.length ? "Add another item" : "Add an item",
    label: "Add item",
    variant: "outline",
    focusKey: `${ownerId}:add-bullet`,
    onClick: () => {
      const b = emptyBullet();
      ctx.change(() => bullets.push(b), { structural: true, focusKey: keyFor(b, "text") });
    },
  });
  wrap.append(add);
  return wrap;
}
