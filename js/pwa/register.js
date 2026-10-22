import { canUseServiceWorker } from "../utils/platform.js";
import { toast } from "../components/toast.js";
import { getSettings, updateSettings } from "../state/settings.js";

/** 'unsupported' | 'pending' | 'ready' */
let swState = canUseServiceWorker() ? "pending" : "unsupported";
let registration = null;
let userRequestedReload = false;
let updateAnnounced = false;
const stateListeners = new Set();
const beforeUpdateHooks = [];

export const getOfflineState = () => swState;

export function onOfflineState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/** Later phases register a flush here so pending edits are saved before an update reload. */
export function onBeforeUpdateReload(fn) {
  beforeUpdateHooks.push(fn);
}

function setState(next) {
  if (swState === next) return;
  swState = next;
  stateListeners.forEach((fn) => fn(next));
}

async function applyUpdate(worker) {
  userRequestedReload = true;
  try {
    await Promise.all(beforeUpdateHooks.map((fn) => fn()));
  } catch {
    /* never block an update on a failed flush */
  }
  worker.postMessage({ type: "SKIP_WAITING" });
}

function announceUpdate(worker) {
  if (updateAnnounced) return;
  updateAnnounced = true;
  toast({
    message: "A new version of CareerCanvas is ready.",
    tone: "ok",
    duration: 0,
    action: { label: "Reload", onClick: () => applyUpdate(worker) },
  });
}

function watchInstalling(worker) {
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) announceUpdate(worker);
  });
}

export async function registerServiceWorker() {
  if (!canUseServiceWorker()) return;
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    setState("ready");
    if (hadController && userRequestedReload) location.reload();
  });

  try {
    registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    setState("unsupported");
    return;
  }

  if (navigator.serviceWorker.controller) setState("ready");
  else {
    navigator.serviceWorker.ready.then(() => {
      setState("ready");
      if (!hadController && !getSettings().offlineToastShown) {
        updateSettings({ offlineToastShown: true });
        toast({ message: "CareerCanvas is ready to use offline.", tone: "ok" });
      }
    });
  }

  if (registration.waiting && navigator.serviceWorker.controller) announceUpdate(registration.waiting);
  registration.addEventListener("updatefound", () => {
    if (registration.installing) watchInstalling(registration.installing);
  });

  // Look for updates when the app returns to the foreground (at most hourly)
  let lastCheck = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > 60 * 60 * 1000) {
      lastCheck = Date.now();
      registration.update().catch(() => {});
    }
  });
}

/** @returns {Promise<'unsupported'|'update-ready'|'up-to-date'|'error'>} */
export async function checkForUpdates() {
  if (!registration) return "unsupported";
  try {
    await registration.update();
    const installing = registration.installing;
    if (installing) {
      await new Promise((resolve) => {
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" || installing.state === "redundant") resolve();
        });
      });
    }
    if (registration.waiting) {
      announceUpdate(registration.waiting);
      return "update-ready";
    }
    return "up-to-date";
  } catch {
    return "error";
  }
}
