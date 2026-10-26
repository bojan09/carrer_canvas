import { getSettings } from "../state/settings.js";

/** Reorder and insertion transitions (FLIP). Records where keyed elements are, lets the UI re-render, then
 *  slides each element from its old place to its new one. Transform and opacity only, so layout never shifts.
 *  Skipped when the user prefers reduced motion (OS setting or the in-app Motion option). */

export const motionAllowed = () => {
  if (getSettings().motion === "reduced") return false;
  return !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
};

const SELECTOR = "[data-flip-key]";

/** @returns {Map<string, {top: number, left: number}>} viewport positions of every visible keyed element */
export function captureFlip(root) {
  const map = new Map();
  root.querySelectorAll(SELECTOR).forEach((el) => {
    if (!el.offsetParent) return;
    const r = el.getBoundingClientRect();
    map.set(el.dataset.flipKey, { top: r.top, left: r.left });
  });
  return map;
}

/** Call after the re-render (and after scroll has been restored). */
export function playFlip(root, before, { duration = 240 } = {}) {
  if (!motionAllowed() || !before.size) return 0;
  let played = 0;
  root.querySelectorAll(SELECTOR).forEach((el) => {
    if (!el.offsetParent || !el.animate) return;
    const old = before.get(el.dataset.flipKey);
    const now = el.getBoundingClientRect();
    if (old) {
      const dy = old.top - now.top;
      const dx = old.left - now.left;
      if (Math.abs(dy) < 2 && Math.abs(dx) < 2) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
    } else {
      el.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: duration - 40, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
    }
    played += 1;
  });
  return played;
}
