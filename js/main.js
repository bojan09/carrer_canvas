import { applySettings, resolveTheme, updateSettings, subscribe } from "./state/settings.js";
import { mountNav } from "./components/nav.js";
import { startRouter } from "./router.js";
import { registerServiceWorker } from "./pwa/register.js";
import "./pwa/install.js"; // attaches beforeinstallprompt listener as early as possible
import { toast } from "./components/toast.js";
import { icon } from "./utils/dom.js";
import { APP_VERSION } from "./config.js";
import { initPrintSupport } from "./export/print.js";
import { activeSession } from "./state/resume-store.js";

applySettings();
mountNav();

// Skip link: hash routing means a plain #main anchor would change the route.
document.querySelector(".skip-link").addEventListener("click", (e) => {
  e.preventDefault();
  const main = document.getElementById("main");
  main.setAttribute("tabindex", "-1");
  main.focus();
});

// Theme toggle (explicit light/dark; "System" is chosen in Settings)
const themeBtn = document.getElementById("theme-toggle");
function paintThemeBtn() {
  const dark = resolveTheme() === "dark";
  themeBtn.innerHTML = icon(dark ? "sun" : "moon");
  themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}
themeBtn.addEventListener("click", () => {
  updateSettings({ theme: resolveTheme() === "dark" ? "light" : "dark" });
});
subscribe(paintThemeBtn);
paintThemeBtn();

// Connectivity indicator. Says "offline", never implies cloud sync.
const pill = document.getElementById("net-status");
function paintNet(announce) {
  const offline = !navigator.onLine;
  pill.hidden = !offline;
  if (announce) {
    toast({
      message: offline ? "You're offline. CareerCanvas keeps working." : "Back online.",
      tone: offline ? "warn" : "ok",
      duration: 3500,
    });
  }
}
window.addEventListener("online", () => paintNet(true));
window.addEventListener("offline", () => paintNet(true));
paintNet(false);

initPrintSupport(() => activeSession()?.doc || null);

document.getElementById("footer-version").textContent = `Version ${APP_VERSION}`;

startRouter().finally(registerServiceWorker);
