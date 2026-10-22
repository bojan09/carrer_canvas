import { h, icon } from "../utils/dom.js";

let counter = 0;

/**
 * Accessible modal built on native <dialog> (focus trap, Esc, inert background,
 * focus restoration come from the platform).
 * @param {{title: string, body: Node|string, actions?: Array<{label:string, value:any, variant?:string}>}} opts
 * @returns {Promise<any>} value of the chosen action, or undefined when dismissed
 */
export function openDialog({ title, body, actions = [{ label: "Close", value: undefined, variant: "outline" }] }) {
  return new Promise((resolve) => {
    const id = `dlg-${++counter}`;
    const dialog = h("dialog", { class: "dialog", "aria-labelledby": `${id}-t` });

    const closeBtn = h("button", { type: "button", class: "btn btn--icon", "aria-label": "Close dialog" });
    closeBtn.innerHTML = icon("x");
    closeBtn.addEventListener("click", () => dialog.close(""));

    const content = h("div", { class: "dialog__body" });
    if (typeof body === "string") content.textContent = body;
    else content.append(body);

    const foot = h("div", { class: "dialog__foot" });
    let result;
    actions.forEach((a, index) => {
      const btn = h("button", {
        type: "button",
        class: `btn btn--${a.variant || "outline"}`,
        text: a.label,
        onclick: () => {
          result = a.value;
          dialog.close("action");
        },
      });
      if (index === actions.length - 1) btn.dataset.primary = "true";
      foot.append(btn);
    });

    dialog.append(
      h("div", { class: "dialog__head" }, h("h2", { class: "dialog__title", id: `${id}-t`, text: title }), closeBtn),
      content,
      foot,
    );

    // Click on the backdrop (the dialog element itself) dismisses
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close("");
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });

    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Confirmation helper for destructive actions. Resolves true/false. */
export async function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  const value = await openDialog({
    title,
    body: message,
    actions: [
      { label: "Cancel", value: false, variant: "outline" },
      { label: confirmLabel, value: true, variant: danger ? "danger" : "primary" },
    ],
  });
  return value === true;
}
