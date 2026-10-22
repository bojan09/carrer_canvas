import { h, icon } from "../utils/dom.js";
import { validateField } from "../utils/validation.js";

let counter = 0;
const uid = (p = "f") => `${p}${++counter}`;

/** Labelled input/textarea with hint, inline validation and a length counter.
 *  Validation shows after the first blur and updates live afterwards. Content is always saved. */
export function textField({
  label,
  value = "",
  type = "text",
  max,
  hint,
  autocomplete,
  inputmode,
  placeholder,
  validate,
  list,
  rows = 3,
  disabled = false,
  full = false,
  onInput,
  extraError,
}) {
  const id = uid();
  const isArea = type === "textarea" || type === "tags";
  const input = h(isArea ? "textarea" : "input", { id, class: "input", name: id });
  if (isArea) input.rows = rows;
  else input.type = type === "month" ? "month" : type;
  if (max) input.maxLength = max;
  if (autocomplete) input.autocomplete = autocomplete;
  else input.autocomplete = "off";
  if (inputmode) input.inputMode = inputmode;
  if (placeholder) input.placeholder = placeholder;
  if (type === "month") input.pattern = "\\d{4}-(0[1-9]|1[0-2])";
  if (type === "email" || type === "url" || type === "tel") input.spellcheck = false;
  input.value = value;
  input.disabled = disabled;

  const errorEl = h("p", { class: "field__error", id: `${id}-err`, "aria-live": "polite" });
  const hintEl = hint ? h("p", { class: "field__hint", id: `${id}-hint`, text: hint }) : null;
  const counter = max && isArea ? h("span", { class: "field__count", "aria-hidden": "true" }) : null;

  if (list) {
    const dl = h("datalist", { id: `${id}-list` }, list.map((v) => h("option", { value: v })));
    input.setAttribute("list", dl.id);
    input._datalist = dl;
  }

  const describedBy = [hintEl && hintEl.id, errorEl.id].filter(Boolean).join(" ");
  input.setAttribute("aria-describedby", describedBy);

  let touched = false;
  const check = () => {
    const message = (validate && validateField({ validate }, input.value)) || (extraError ? extraError() : "");
    errorEl.textContent = message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    return message;
  };
  const updateCounter = () => {
    if (!counter) return;
    const len = input.value.length;
    counter.textContent = len >= max * 0.8 ? `${len}/${max}` : "";
  };

  input.addEventListener("input", () => {
    onInput?.(input.value);
    if (touched) check();
    updateCounter();
  });
  input.addEventListener("blur", () => {
    touched = true;
    check();
  });
  updateCounter();

  const root = h(
    "div",
    { class: `field${full ? " field--full" : ""}` },
    h("label", { class: "field__label", for: id, text: label }),
    input,
    input._datalist || null,
    hintEl,
    h("div", { class: "field__foot" }, errorEl, counter),
  );
  return { root, input, check, touch: () => ((touched = true), check()) };
}

export function checkboxField({ label, checked = false, onChange }) {
  const id = uid();
  const input = h("input", { type: "checkbox", id, class: "check__input" });
  input.checked = checked;
  input.addEventListener("change", () => onChange?.(input.checked));
  const root = h("div", { class: "field field--check" }, h("label", { class: "check", for: id }, input, h("span", { text: label })));
  return { root, input };
}

/** Icon-only (or icon+label) button with an accessible name. */
export function iconButton({ name, label, onClick, variant = "ghost", text, focusKey, disabled = false, pressed }) {
  const btn = h("button", { type: "button", class: `btn btn--${variant} btn--sm btn--tool`, "aria-label": label });
  btn.innerHTML = icon(name) + (text ? `<span>${text}</span>` : "");
  if (text) btn.removeAttribute("aria-label");
  if (focusKey) btn.dataset.focusKey = focusKey;
  if (pressed != null) btn.setAttribute("aria-pressed", String(pressed));
  btn.disabled = disabled;
  btn.addEventListener("click", onClick);
  return btn;
}
