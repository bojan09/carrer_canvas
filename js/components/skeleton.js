import { h } from "../utils/dom.js";

/** Loading placeholders that match the final layout so nothing jumps when content arrives.
 *  `whenSlow` only shows one if the work takes longer than `delay` ms: fast loads never flash a skeleton,
 *  and nothing here waits on purpose. */

const block = (cls) => h("span", { class: `skel ${cls}`, "aria-hidden": "true" });

export function docCardsSkeleton(n = 3) {
  return h(
    "div",
    { class: "container page", role: "status", "aria-label": "Loading your documents" },
    h("div", { class: "skel-head" }, block("skel--title"), block("skel--line")),
    h("div", { class: "doc-grid" }, Array.from({ length: n }, () => h("div", { class: "doc-card skel-card" }, block("skel--badge"), block("skel--title"), block("skel--line"), block("skel--actions")))),
  );
}

export function studioSkeleton() {
  return h(
    "div",
    { class: "container page", role: "status", "aria-label": "Opening your document" },
    h("div", { class: "skel-head" }, block("skel--title"), block("skel--line")),
    h("div", { class: "skel-studio" }, h("div", { class: "skel-studio__editor" }, ...Array.from({ length: 4 }, () => block("skel--card"))), block("skel--paper")),
  );
}

/** Shows `make()` inside `root` only if `isDone()` is still false after `delay` ms. Returns a cancel function. */
export function whenSlow(root, make, isDone, delay = 180) {
  const timer = setTimeout(() => {
    if (!isDone()) root.replaceChildren(make());
  }, delay);
  return () => clearTimeout(timer);
}
