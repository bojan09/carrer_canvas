import { h } from "../utils/dom.js";
import { getSettings, updateSettings } from "../state/settings.js";

/** Skippable first-run tour of the editor. Non-modal: it never blocks the page, Esc or Skip ends it,
 *  and it is shown once (Settings can bring it back). Targets are found with data-tour attributes. */

export const TOUR_STEPS = [
  { target: '[data-tour="status"]', title: "Saved as you type", text: "Your work is saved on this device automatically. The line under the title tells you when it has been saved." },
  { target: '[data-tour="view"]', title: "Edit, Style and Preview", text: "Write in Edit, make it yours in Style, and check the page in Preview. On wide screens the preview stays beside you." },
  { target: '[data-tour="style-btn"]', title: "Style your document", text: "Change colours, fonts, boldness, size and layout. Or just click any text in the preview to format it." },
  { target: '[data-tour="undo"]', title: "Everything can be undone", text: "Undo and redo cover every change, including deletes. Ctrl or ⌘ + Z works too." },
  { target: '[data-tour="checklist"]', title: "Writing checklist", text: "Friendly reminders about gaps in your document. It is guidance, not a score." },
  { target: '[data-tour="export"]', title: "Save as PDF", text: "This opens your browser's print dialog, where you choose Save as PDF. We show you the steps first." },
];

const visible = (el) => Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

/** @returns {{stop: () => void} | null} null when there is nothing to show */
export function startTour({ steps = TOUR_STEPS, root = document, onEnd } = {}) {
  const usable = steps.map((s) => ({ ...s, el: root.querySelector(s.target) })).filter((s) => visible(s.el));
  if (!usable.length) return null;

  let index = 0;
  const previousFocus = document.activeElement;
  const id = "tour-title";
  const title = h("h2", { class: "tour__title", id });
  const text = h("p", { class: "tour__text", id: "tour-text" });
  const count = h("span", { class: "tour__count" });
  const back = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Back" });
  const next = h("button", { type: "button", class: "btn btn--primary btn--sm" });
  const skip = h("button", { type: "button", class: "btn btn--ghost btn--sm", text: "Skip tour" });
  const card = h(
    "div",
    { class: "tour", role: "dialog", "aria-modal": "false", "aria-labelledby": id, "aria-describedby": "tour-text" },
    count,
    title,
    text,
    h("div", { class: "tour__actions" }, skip, h("span", { class: "tour__spacer" }), back, next),
  );
  document.body.append(card);

  let current = null;
  const place = () => {
    const s = usable[index];
    const r = s.el.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 16);
    card.style.setProperty("width", `${w}px`);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = r.bottom + 12 + card.offsetHeight <= window.innerHeight - 8;
    const top = below ? r.bottom + 12 : Math.max(8, r.top - 12 - card.offsetHeight);
    card.style.setProperty("left", `${left}px`);
    card.style.setProperty("top", `${top}px`);
  };

  function show(i) {
    index = i;
    const s = usable[index];
    current?.classList.remove("tour-target");
    current = s.el;
    current.classList.add("tour-target");
    s.el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    title.textContent = s.title;
    text.textContent = s.text;
    count.textContent = `Step ${index + 1} of ${usable.length}`;
    back.hidden = index === 0;
    next.textContent = index === usable.length - 1 ? "Done" : "Next";
    place();
    next.focus({ preventScroll: true });
  }

  function end(markSeen = true) {
    if (!card.isConnected) return;
    current?.classList.remove("tour-target");
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    card.remove();
    if (markSeen) updateSettings({ tourSeen: true });
    if (previousFocus && previousFocus !== document.body && previousFocus.isConnected) previousFocus.focus?.({ preventScroll: true });
    onEnd?.();
  }

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      end();
    }
  };
  next.addEventListener("click", () => (index === usable.length - 1 ? end() : show(index + 1)));
  back.addEventListener("click", () => show(index - 1));
  skip.addEventListener("click", () => end());
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  show(0);
  return { stop: () => end(false) };
}

export const tourPending = () => !getSettings().tourSeen;
