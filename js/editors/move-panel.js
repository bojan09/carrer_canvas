import { h } from "../utils/dom.js";
import { renderDocument } from "../preview/render.js";
import { MOVE_LIMITS, resolveDesign } from "../templates/design.js";
import { announce } from "../components/announcer.js";

/** "Move blocks": nudge the name, contact line, a whole section or a letter part by millimetres.
 *  The block keeps its place in the flow (page breaks do not change); only its drawing moves, so dragging it
 *  over another block overlaps it. The page order in the DOM is unchanged, but Chrome paints a moved block after
 *  the others, so a PDF text extractor (and resume-scanning software) may read it last. Offsets live in designSettings.moves[blockId] = { x, y }. */

let uid = 0;
const nid = (p) => `${p}-${++uid}`;
const clamp = (n) => Math.min(MOVE_LIMITS.max, Math.max(MOVE_LIMITS.min, n));

/** Blocks the current document actually has, in reading order, with their on-paper names. */
export function movableBlocks(doc) {
  const probe = renderDocument({ ...doc, designSettings: { ...doc.designSettings, moves: {}, simplified: false } });
  return [...probe.querySelectorAll("[data-move]")].map((n) => ({ id: n.dataset.move, label: n.dataset.moveLabel || n.dataset.move }));
}

export function moveCard({ doc, ctx, block, onBlock }) {
  const design = resolveDesign(doc);
  const blocks = movableBlocks(doc);
  const current = blocks.find((b) => b.id === block) || blocks[0];
  const root = h("div", { class: "move" });
  if (design.simplified) {
    root.append(h("p", { class: "field__hint", text: "Simplified (ATS-conscious) mode keeps a plain single column, so blocks cannot be moved. Turn it off in Layout and page to move blocks." }));
    return { el: root };
  }
  if (!current) return { el: root };

  const read = () => doc.designSettings.moves?.[current.id] || { x: 0, y: 0 };
  const write = (x, y, opts = {}) =>
    ctx.change(
      () => {
        const moves = (doc.designSettings.moves ||= {});
        if (x || y) moves[current.id] = { x, y };
        else delete moves[current.id];
        if (!Object.keys(moves).length) delete doc.designSettings.moves;
      },
      { group: `move.${current.id}`, ...opts },
    );

  const selId = nid("mvsel");
  const select = h("select", { class: "input input--select", id: selId, "data-focus-key": "move:block" });
  for (const b of blocks) {
    const o = h("option", { value: b.id, text: b.label });
    if (b.id === current.id) o.selected = true;
    select.append(o);
  }
  select.addEventListener("change", () => onBlock(select.value));

  const sliders = {};
  const slider = (axis, label) => {
    const id = nid("mv");
    const out = h("output", { for: id });
    const input = h("input", { type: "range", id, class: "range", min: String(MOVE_LIMITS.min), max: String(MOVE_LIMITS.max), step: String(MOVE_LIMITS.step) });
    input.addEventListener("input", () => {
      const m = read();
      write(axis === "x" ? Number(input.value) : m.x, axis === "y" ? Number(input.value) : m.y);
      sync();
    });
    sliders[axis] = { input, out };
    return h("div", { class: "slider" }, h("label", { for: id, text: label }), out, input);
  };

  const reset = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Put this block back" });
  const resetAll = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Put all blocks back" });
  const sync = () => {
    const m = read();
    for (const axis of ["x", "y"]) {
      sliders[axis].input.value = String(m[axis]);
      const text = `${m[axis]} mm`;
      sliders[axis].out.textContent = text;
      sliders[axis].input.setAttribute("aria-valuetext", text);
    }
    reset.disabled = !(m.x || m.y);
    resetAll.disabled = !Object.keys(doc.designSettings.moves || {}).length;
  };

  const nudge = (dx, dy, label, glyph) => {
    const b = h("button", { type: "button", class: "btn btn--outline btn--sm move__arrow", "aria-label": label, text: glyph });
    b.addEventListener("click", (e) => {
      const step = e.shiftKey ? 5 : 1;
      const m = read();
      write(clamp(m.x + dx * step), clamp(m.y + dy * step));
      sync();
    });
    return b;
  };

  reset.addEventListener("click", () => {
    write(0, 0, { structural: true, focusKey: "move:reset" });
    announce(`${current.label} put back.`);
  });
  resetAll.addEventListener("click", () => {
    ctx.change(() => delete doc.designSettings.moves, { structural: true, focusKey: "move:reset-all" });
    announce("All blocks put back.");
  });
  reset.dataset.focusKey = "move:reset";
  resetAll.dataset.focusKey = "move:reset-all";

  root.append(
    h("p", { class: "field__hint", text: "Drag a block in the preview with a mouse or pen, or use the arrows and sliders (hold Shift for bigger steps). A block keeps its place in the page flow, so it can overlap others and page breaks do not move: check the preview before you export." }),
    h("p", { class: "field__hint move__warn", text: "Moved blocks can be read in a different order by resume-scanning software. If you apply through an online form, leave blocks in place or switch on Simplified mode, which ignores moves." }),
    h("label", { class: "field__label", for: selId, text: "Block to move" }),
    select,
    h("div", { class: "move__pad", role: "group", "aria-label": "Nudge the selected block" }, nudge(0, -1, "Move up", "↑"), nudge(-1, 0, "Move left", "←"), nudge(1, 0, "Move right", "→"), nudge(0, 1, "Move down", "↓")),
    slider("x", "Sideways"),
    slider("y", "Up or down"),
    h("div", { class: "move__actions" }, reset, resetAll),
  );
  sync();
  return { el: root };
}
