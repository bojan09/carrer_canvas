import { isAndroid, isIOS, isIOSThirdParty, isStandalone } from "../utils/platform.js";
import { h, icon } from "../utils/dom.js";
import { openDialog } from "../components/dialog.js";
import { toast } from "../components/toast.js";

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(getInstallState()));

// Captured at module load so a prompt fired before the UI renders is not lost.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  notify();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  notify();
  toast({ message: "CareerCanvas installed.", tone: "ok" });
});

window.matchMedia("(display-mode: standalone)").addEventListener("change", notify);

/** @returns {{kind: 'installed'|'prompt'|'ios'|'android-manual'|'manual'}} */
export function getInstallState() {
  if (isStandalone()) return { kind: "installed" };
  if (deferredPrompt) return { kind: "prompt" };
  if (isIOS) return { kind: "ios" };
  if (isAndroid) return { kind: "android-manual" };
  return { kind: "manual" };
}

export function onInstallState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return "unavailable";
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome;
}

export function showInstallHelp(kind = getInstallState().kind) {
  const body = h("div");
  let title = "Install CareerCanvas";

  if (kind === "ios") {
    title = "Add to Home Screen";
    body.innerHTML = `
      <p>Install CareerCanvas from the Share menu. There is no automatic install prompt on iPhone or iPad.</p>
      <ol class="steps">
        <li><span>${isIOSThirdParty ? "Open the Share menu in your browser's toolbar." : "Open this page in Safari and tap the Share button"} ${icon("share", "inline-icon")} in the toolbar.</span></li>
        <li><span>Scroll down and tap <strong>Add to Home Screen</strong> ${icon("plus-square", "inline-icon")}.</span></li>
        <li><span>Tap <strong>Add</strong>. CareerCanvas now opens full-screen from your Home Screen.</span></li>
      </ol>
      <p class="notice">${icon("info")}<span>On iOS the installed app keeps its <strong>own storage</strong>, separate from Safari. Install first, then create your documents in the installed app.</span></p>`;
  } else if (kind === "android-manual") {
    body.innerHTML = `
      <p>Your browser did not offer an install prompt yet. You can still install it manually:</p>
      <ol class="steps">
        <li><span>Open the browser menu (<strong>⋮</strong>).</span></li>
        <li><span>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span></li>
        <li><span>Confirm. CareerCanvas appears in your app list and works offline.</span></li>
      </ol>`;
  } else {
    body.innerHTML = `
      <p>Look for an <strong>install</strong> icon in the address bar, or open the browser menu and choose <strong>Install CareerCanvas</strong> / <strong>Install app</strong>.</p>
      <p>Not every browser supports installation. CareerCanvas still works offline in a normal tab after your first visit.</p>`;
  }

  return openDialog({ title, body, actions: [{ label: "Got it", value: true, variant: "primary" }] });
}
