import { h } from "../utils/dom.js";
import { PAPER } from "../templates/design.js";
import { renderDocument } from "./render.js";

export const ZOOM_MODES = [
  ["fit-width", "Fit width"],
  ["fit-page", "Fit page"],
  ["75", "75%"],
  ["100", "100%"],
  ["125", "125%"],
];

const PAD = 14;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/**
 * Paper preview: renders the canonical resume at real paper size and scales it with a CSS transform.
 * Page-break guides are ESTIMATES from the content height; real pagination is decided by the
 * browser's print engine (see docs/PRINT_EXPORT.md in a later phase).
 */
export function mountPaper(container, { zoom = "fit-width", onInfo = () => {}, onPick = null } = {}) {
  const sizer = h("div", { class: "stage__sizer" });
  const scroller = h("div", { class: "stage", tabindex: "0", role: "region", "aria-label": "Document preview, scrollable" }, sizer);
  container.replaceChildren(scroller);
  let selected = null;

  const paintSelection = () => {
    scroller.querySelectorAll("[data-selected]").forEach((n) => n.removeAttribute("data-selected"));
    if (selected) scroller.querySelectorAll(`[data-role="${selected}"]`).forEach((n) => n.setAttribute("data-selected", "true"));
  };

  // Clicking text in the preview picks it for formatting. Links are inert here so a click never leaves the editor.
  if (onPick) {
    scroller.classList.add("stage--pick");
    scroller.addEventListener("click", (e) => {
      const hit = e.target.closest?.("[data-role]");
      if (e.target.closest?.("a")) e.preventDefault();
      if (hit) onPick(hit.dataset.role);
    });
  }

  let doc = null;
  let mode = zoom;
  let current = null;
  let signature = "";
  let raf = 0;

  function layout() {
    if (!current || !doc) return;
    const paper = PAPER[doc.pageSize] || PAPER.A4;
    const cw = Math.max(120, scroller.clientWidth - PAD * 2);
    const ch = Math.max(120, scroller.clientHeight - PAD * 2);
    let z;
    if (mode === "fit-width") z = cw / paper.w;
    else if (mode === "fit-page") z = Math.min(cw / paper.w, ch / paper.h);
    else z = Number(mode) / 100;
    z = clamp(z, 0.15, 3);

    current.style.transformOrigin = "0 0";
    current.style.transform = `scale(${z})`;
    const docH = current.offsetHeight;
    sizer.style.width = `${paper.w * z}px`;
    sizer.style.height = `${docH * z}px`;

    sizer.querySelectorAll(".stage__guide").forEach((n) => n.remove());
    const pages = Math.max(1, Math.ceil(docH / paper.h - 0.002));
    for (let k = 1; k < pages; k += 1) {
      const guide = h("div", { class: "stage__guide", "aria-hidden": "true" }, h("span", { text: `Page ${k + 1} starts (approx.)` }));
      guide.style.top = `${k * paper.h * z}px`;
      sizer.append(guide);
    }
    onInfo({ pages, zoom: z, paper: doc.pageSize });
  }

  function schedule() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  }

  const ro = new ResizeObserver(schedule);
  ro.observe(scroller);
  // bundled fonts load on first use and change line breaks and page length, so measure again when they arrive
  document.fonts?.addEventListener?.("loadingdone", schedule);

  return {
    update(nextDoc) {
      doc = nextDoc;
      const next = renderDocument(doc);
      const sig = `${doc.templateId}|${next.dataset.template}|${doc.pageSize}`;
      if (current && sig !== signature) next.style.animation = "doc-in 260ms var(--ease) both";
      signature = sig;
      if (current) current.replaceWith(next);
      else sizer.prepend(next);
      current = next;
      paintSelection();
      layout();
    },
    setSelection(role) {
      selected = role;
      paintSelection();
    },
    setZoom(next) {
      mode = next;
      layout();
    },
    destroy() {
      cancelAnimationFrame(raf);
      document.fonts?.removeEventListener?.("loadingdone", schedule);
      ro.disconnect();
    },
  };
}
