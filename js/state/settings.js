import { SETTINGS_KEY, THEME_COLORS } from "../config.js";

const DEFAULTS = { theme: "dark", motion: "system", offlineToastShown: false };
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
      offlineToastShown: raw.offlineToastShown === true,
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

export function resetSettings() {
  return updateSettings({ ...DEFAULTS });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Follow the OS when the preference is "system"
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (state.theme === "system") applySettings();
});
