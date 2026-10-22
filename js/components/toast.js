import { h, icon } from "../utils/dom.js";

const ICONS = { info: "info", ok: "check", warn: "info" };

/**
 * Show a toast in the polite live region. duration 0 keeps it until dismissed.
 * @returns {{dismiss: () => void}}
 */
export function toast({ message, tone = "info", duration = 5000, action } = {}) {
  const region = document.getElementById("toasts");
  if (!region) return { dismiss() {} };

  const el = h("div", { class: `toast toast--${tone}` });
  el.insertAdjacentHTML("afterbegin", icon(ICONS[tone] || "info"));
  el.append(h("span", { class: "toast__text", text: message }));

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add("is-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };

  if (action) {
    el.append(
      h("button", {
        type: "button",
        class: "btn btn--sm",
        text: action.label,
        onclick: () => {
          dismiss();
          action.onClick?.();
        },
      }),
    );
  }

  const close = h("button", { type: "button", class: "btn btn--icon", "aria-label": "Dismiss notification" });
  close.innerHTML = icon("x");
  close.addEventListener("click", dismiss);
  el.append(close);

  region.append(el);
  if (duration > 0) timer = setTimeout(dismiss, duration);
  return { dismiss };
}
