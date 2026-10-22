/** Mouse drag-and-drop reordering as an enhancement. Every sortable list ALSO ships
 *  up/down buttons, which are the keyboard and touch path. */
export function makeSortable(list, { itemSelector, handleSelector, onMove }) {
  let dragIndex = -1;
  const items = () => Array.from(list.querySelectorAll(itemSelector)).filter((el) => el.parentElement === list);

  const clear = () => items().forEach((el) => el.classList.remove("is-drop-before", "is-drop-after", "is-dragging"));

  items().forEach((item) => {
    const handle = item.querySelector(handleSelector);
    if (!handle) return;
    handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") item.draggable = true;
    });
    const stop = () => (item.draggable = false);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);

    item.addEventListener("dragstart", (e) => {
      dragIndex = items().indexOf(item);
      item.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(dragIndex));
    });
    item.addEventListener("dragend", () => {
      item.draggable = false;
      dragIndex = -1;
      clear();
    });
    item.addEventListener("dragover", (e) => {
      if (dragIndex < 0) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = item.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      items().forEach((el) => el.classList.remove("is-drop-before", "is-drop-after"));
      item.classList.add(before ? "is-drop-before" : "is-drop-after");
    });
    item.addEventListener("drop", (e) => {
      if (dragIndex < 0) return;
      e.preventDefault();
      const all = items();
      const target = all.indexOf(item);
      const before = item.classList.contains("is-drop-before");
      let to = before ? target : target + 1;
      if (dragIndex < to) to -= 1;
      const from = dragIndex;
      clear();
      dragIndex = -1;
      if (from !== to) onMove(from, to);
    });
  });
}
