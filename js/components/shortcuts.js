import { h } from "../utils/dom.js";
import { openDialog } from "./dialog.js";

/** One list of keyboard shortcuts, shown in the help dialog (press ?) and on the Settings page.
 *  `mod` means Ctrl on Windows/Linux and Command on Mac. Only shortcuts that really exist are listed. */

export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || "") && !/Windows/.test(navigator.userAgent || "");
export const modLabel = isMac ? "⌘" : "Ctrl";

export const SHORTCUT_GROUPS = [
  {
    title: "Anywhere",
    items: [{ keys: ["?"], label: "Show this list" }],
  },
  {
    title: "In the editor",
    items: [
      { keys: ["mod", "Z"], label: "Undo the last change" },
      { keys: ["mod", "Shift", "Z"], label: "Redo (Ctrl+Y also works)" },
      { keys: ["mod", "S"], label: "Check that your work is saved (it saves automatically)" },
      { keys: ["mod", "P"], label: "Print or save the open document as PDF" },
      { keys: ["Alt", "1"], label: "Edit tab (when not typing in a field)" },
      { keys: ["Alt", "2"], label: "Preview tab (small screens)" },
      { keys: ["Alt", "3"], label: "Style tab" },
    ],
  },
  {
    title: "Dialogs and menus",
    items: [
      { keys: ["Esc"], label: "Close a dialog or skip the tour" },
      { keys: ["Tab"], label: "Move between controls. Reordering also works with the up and down buttons" },
    ],
  },
];

const keyCap = (k) => h("kbd", { class: "kbd", text: k === "mod" ? modLabel : k });

export function shortcutList() {
  const wrap = h("div", { class: "shortcuts" });
  for (const g of SHORTCUT_GROUPS) {
    wrap.append(
      h("h3", { class: "shortcuts__group", text: g.title }),
      h(
        "dl",
        { class: "shortcuts__list" },
        g.items.flatMap((it) => [
          h("dt", {}, it.keys.flatMap((k, i) => (i ? [document.createTextNode(" + "), keyCap(k)] : [keyCap(k)]))),
          h("dd", { text: it.label }),
        ]),
      ),
    );
  }
  return wrap;
}

export function openShortcuts() {
  if (document.querySelector("dialog.dialog[open]")) return Promise.resolve();
  return openDialog({ title: "Keyboard shortcuts", body: shortcutList(), actions: [{ label: "Close", value: true, variant: "primary" }] });
}

const isTyping = (el) => el?.closest?.("input, textarea, select, [contenteditable='true']");

/** Global "?" shortcut. Ignored while typing or when another dialog is open. */
export function initShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    e.preventDefault();
    openShortcuts();
  });
}
