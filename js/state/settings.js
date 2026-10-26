import { SETTINGS_KEY, THEME_COLORS } from "../config.js";

const localePaper = () => (/^(en-(US|CA|PH)|es-(US|MX)|fr-CA)/i.test(navigator.language || "") ? "Letter" : "A4");
const DEFAULTS = { theme: "dark", motion: "system", previewZoom: "fit-width", pageSize: localePaper(), printReview: true, lastBackupAt: null, offlineToastShown: false, tourSeen: false, styleSeen: false };
const ZOOMS = ["fit-width", "fit-page", "75", "100", "125"];
const THEMES = ["light", "dark", "system"];
const MOTIONS = ["system", "reduced"];

const listeners = new Set();
let state = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      theme: THEMES.includes(raw.theme) ? raw.theme : DEFAULTS.theme,
      motion: MOTIONS.includes(raw.motion) ? raw.motion : DEFAULTS.motion,
      previewZoom: ZOOMS.includes(raw.previewZoom) ? raw.previewZoom : DEFAULTS.previewZoom,
      pageSize: raw.pageSize === "A4" || raw.pageSize === "Letter" ? raw.pageSize : DEFAULTS.pageSize,
      printReview: raw.printReview !== false,
      lastBackupAt: typeof raw.lastBackupAt === "string" && !Number.isNaN(Date.parse(raw.lastBackupAt)) ? raw.lastBackupAt : null,
      offlineToastShown: raw.offlineToastShown === true,
      tourSeen: raw.tourSeen === true,
      styleSeen: raw.styleSeen === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // private mode / blocked storage: setting lasts for this session only
  }
}

export function resolveTheme(pref = state.theme) {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applySettings() {
  const root = document.documentElement;
  const resolved = resolveTheme();
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", state.theme);
  root.setAttribute("data-motion", state.motion);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[resolved]);
}

export const getSettings = () => ({ ...state });

export function updateSettings(patch) {
  state = { ...state, ...patch };
  const saved = persist();
  applySettings();
  listeners.forEach((fn) => fn(getSettings()));
  return saved;
}

/** Restores preferences only. The last-backup date and one-time flags are records, not preferences, so they stay. */
export function resetSettings() {
  return updateSettings({ ...DEFAULTS, lastBackupAt: state.lastBackupAt, offlineToastShown: state.offlineToastShown, tourSeen: state.tourSeen, styleSeen: state.styleSeen });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Follow the OS when the preference is "system"
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (state.theme === "system") applySettings();
});
