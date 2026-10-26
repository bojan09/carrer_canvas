import { h } from "../utils/dom.js";
import { PAPER } from "../templates/design.js";
import { renderResume } from "./render.js";

/** Real, locally rendered miniature of a template. Returns a cleanup function. */
export function mountThumb(frame, doc, templateId) {
  frame.classList.add("thumb");
  const page = h("div", { class: "thumb__page" });
  const el = renderResume(doc, { templateId });
  el.removeAttribute("aria-label");
  page.inert = true;
  page.setAttribute("aria-hidden", "true");
  page.append(el);
  frame.replaceChildren(page);

  const fit = () => {
    const s = frame.clientWidth / PAPER.A4.w;
    page.style.transform = `scale(${s})`;
  };
  const ro = new ResizeObserver(fit);
  ro.observe(frame);
  fit();
  return () => ro.disconnect();
}
