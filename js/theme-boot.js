/* Classic (non-module) script loaded in <head> so the theme is applied before
   first paint and there is no flash. Mirrors js/state/settings.js. */
(function () {
  var root = document.documentElement;
  var theme = "dark";
  var motion = "system";
  try {
    var saved = JSON.parse(localStorage.getItem("cc.settings.v1") || "{}");
    if (saved.theme === "light" || saved.theme === "dark" || saved.theme === "system") {
      theme = saved.theme;
    }
    if (saved.motion === "reduced" || saved.motion === "system") {
      motion = saved.motion;
    }
  } catch (e) {
    /* storage unavailable: defaults apply */
  }
  var resolved = theme;
  if (theme === "system") {
    resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", theme);
  root.setAttribute("data-motion", motion);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#f5f7fb" : "#091226");
})();
