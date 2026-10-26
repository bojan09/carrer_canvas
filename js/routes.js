/** Route table. Pages are lazy modules; every module must be in the SW precache list. */

export const routes = [
  { path: "/", title: "Home", nav: { label: "Home", icon: "home", mobile: 1 }, load: () => import("./pages/home.js") },
  { path: "/resume", title: "Resume", nav: { label: "Resume", icon: "file-text", mobile: 2 }, load: () => import("./pages/resume.js") },
  { path: "/resume/:id", title: "Resume editor", navPath: "/resume", layout: "studio", load: () => import("./pages/resume.js") },
  { path: "/cover-letter", title: "Cover Letter", nav: { label: "Cover Letter", icon: "mail" }, load: () => import("./pages/cover-letter.js") },
  { path: "/cover-letter/:id", title: "Cover letter editor", navPath: "/cover-letter", layout: "studio", load: () => import("./pages/cover-letter.js") },
  { path: "/templates", title: "Templates", nav: { label: "Templates", icon: "layout-grid", mobile: 3 }, load: () => import("./pages/templates.js") },
  { path: "/saved", title: "Saved", nav: { label: "Saved", icon: "folder", mobile: 4 }, load: () => import("./pages/saved.js") },
  { path: "/settings", title: "Settings", nav: { label: "Settings", icon: "sliders", mobile: 5 }, load: () => import("./pages/settings.js") },
];

export const notFound = { path: "*", title: "Page not found", load: () => import("./pages/not-found.js") };
