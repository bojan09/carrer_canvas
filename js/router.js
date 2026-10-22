import { routes, notFound } from "./routes.js";
import { APP_NAME } from "./config.js";

const root = document.getElementById("main");
const announcer = document.getElementById("route-announcer");
let cleanup = null;
let isFirst = true;
let token = 0;

/** Hash routing keeps refresh and offline navigation working on any static host. */
export function currentPath() {
  const hash = location.hash;
  if (!hash.startsWith("#/")) return "/";
  const path = hash.slice(1).split("?")[0].replace(/\/+$/, "");
  return path || "/";
}

function showLoadError(path) {
  root.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "container page";
  const card = document.createElement("div");
  card.className = "empty";
  const title = document.createElement("h1");
  title.className = "empty__title";
  title.tabIndex = -1;
  title.textContent = "This page could not be loaded";
  const lead = document.createElement("p");
  lead.className = "empty__lead";
  lead.textContent = navigator.onLine
    ? "Something went wrong while loading this page. Try reloading."
    : "You are offline and this page has not been saved on this device yet. Reconnect once and it will work offline afterwards.";
  const link = document.createElement("a");
  link.className = "btn btn--primary";
  link.href = "#/";
  link.textContent = "Back to Home";
  card.append(title, lead, link);
  wrap.append(card);
  root.append(wrap);
  document.title = `Error · ${APP_NAME}`;
  return path;
}

async function render() {
  const mine = ++token;
  const path = currentPath();
  const route = routes.find((r) => r.path === path) || notFound;

  let mod;
  try {
    mod = await route.load();
  } catch {
    if (mine === token) showLoadError(path);
    return;
  }
  if (mine !== token) return;

  if (typeof cleanup === "function") cleanup();
  root.replaceChildren();
  cleanup = mod.default(root, { path }) || null;

  const title = route.title === "Home" ? `${APP_NAME} · Free private resume builder` : `${route.title} · ${APP_NAME}`;
  document.title = title;
  root.classList.remove("page-enter");
  void root.offsetWidth; // restart the enter animation
  root.classList.add("page-enter");

  document.dispatchEvent(new CustomEvent("cc:route", { detail: { path: route.path === "*" ? null : path } }));

  if (!isFirst) {
    window.scrollTo(0, 0);
    const heading = root.querySelector("h1") || root;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    if (announcer) announcer.textContent = `${route.title} page`;
  }
  isFirst = false;
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  return render();
}
