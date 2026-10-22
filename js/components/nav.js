import { routes } from "../routes.js";
import { icon } from "../utils/dom.js";

const link = (r, cls, withIcon) =>
  `<li><a class="${cls}" href="#${r.path}" data-path="${r.path}">${withIcon ? icon(r.nav.icon) : ""}<span>${r.nav.label}</span></a></li>`;

export function mountNav() {
  const header = document.getElementById("site-nav-list");
  const bottom = document.getElementById("bottom-nav-list");

  header.innerHTML = routes.filter((r) => r.nav).map((r) => link(r, "site-nav__link", false)).join("");
  bottom.innerHTML = routes
    .filter((r) => r.nav?.mobile)
    .sort((a, b) => a.nav.mobile - b.nav.mobile)
    .map((r) => link(r, "bottom-nav__link", true))
    .join("");

  document.addEventListener("cc:route", (e) => {
    const active = e.detail.path;
    document.querySelectorAll("[data-path]").forEach((a) => {
      if (a.dataset.path === active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  });
}
