import { APP_VERSION } from "../config.js";
import { icon, h } from "../utils/dom.js";
import { getSettings, updateSettings, resetSettings, subscribe } from "../state/settings.js";
import { mountInstallCard } from "../components/install-card.js";
import { confirmDialog } from "../components/dialog.js";
import { toast } from "../components/toast.js";
import { checkForUpdates, getOfflineState, onOfflineState } from "../pwa/register.js";
import { isStandalone } from "../utils/platform.js";
import { getRepository } from "../storage/repository.js";
import { closeSession, settleSaves } from "../state/resume-store.js";
import { openDialog } from "../components/dialog.js";

const OFFLINE_TEXT = {
  ready: "Ready. The app opens without a connection.",
  pending: "Setting up. Keep this page open a moment.",
  unsupported: "Not available in this browser or context (needs HTTPS and service worker support).",
};

function radioGroup(name, legend, options, value) {
  return `<fieldset><legend class="sr-only">${legend}</legend><div class="segmented">${options
    .map(
      ([v, label]) => `<label class="segmented__option"><input type="radio" name="${name}" value="${v}"${v === value ? " checked" : ""}><span class="segmented__label">${label}</span></label>`,
    )
    .join("")}</div></fieldset>`;
}

const formatBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export default function settings(root) {
  const s = getSettings();
  root.innerHTML = `
  <div class="container page">
    <header class="page-head">
      <h1 class="page-head__title" tabindex="-1">Settings</h1>
      <p class="page-head__lead">Appearance, installation and privacy. There is no account and no cloud sync.</p>
    </header>
    <div class="settings-grid">
      <section class="setting-card" aria-labelledby="s-appearance">
        <h2 id="s-appearance">Appearance</h2>
        <p class="setting-card__lead">These options change the app interface only, not your resume's colours.</p>
        <div class="setting-row">
          <div class="setting-row__label"><strong id="theme-label">Theme</strong><span>System follows your device setting.</span></div>
          <div role="group" aria-labelledby="theme-label">${radioGroup("theme", "Theme", [["light", "Light"], ["dark", "Dark"], ["system", "System"]], s.theme)}</div>
        </div>
        <div class="setting-row">
          <div class="setting-row__label"><strong id="motion-label">Motion</strong><span>Reduced removes animation and transitions.</span></div>
          <div role="group" aria-labelledby="motion-label">${radioGroup("motion", "Motion", [["system", "System"], ["reduced", "Reduced"]], s.motion)}</div>
        </div>
      </section>

      <section class="setting-card" aria-labelledby="s-install">
        <h2 id="s-install">Install app</h2>
        <p class="setting-card__lead">Works on Android, iPhone, iPad and desktop browsers that support installing web apps.</p>
        <div class="install-card" id="install-mount"></div>
      </section>

      <section class="setting-card" aria-labelledby="s-offline">
        <h2 id="s-offline">Offline &amp; updates</h2>
        <dl class="kv">
          <dt>Connection</dt><dd id="kv-conn"></dd>
          <dt>Offline support</dt><dd id="kv-offline"></dd>
          <dt>Running as</dt><dd id="kv-mode"></dd>
          <dt>Version</dt><dd>${APP_VERSION}</dd>
        </dl>
        <div class="setting-row">
          <div class="setting-row__label"><strong>Updates</strong><span id="update-status" role="status">Updates are checked automatically. Nothing reloads without your say-so.</span></div>
          <button type="button" class="btn btn--outline btn--sm" id="check-updates">${icon("refresh")}Check for updates</button>
        </div>
      </section>

      <section class="setting-card" aria-labelledby="s-storage">
        <h2 id="s-storage">Storage</h2>
        <p class="setting-card__lead">Documents will be stored only in this browser. Clearing site data, private browsing or browser storage pressure can remove them, so regular JSON backups are planned.</p>
        <dl class="kv">
          <dt>Storage engine</dt><dd id="kv-engine">Checking…</dd>
          <dt>Documents</dt><dd id="kv-docs">Checking…</dd>
          <dt>Used by this app</dt><dd id="kv-usage">Checking…</dd>
          <dt>Protected from cleanup</dt><dd id="kv-persist">Checking…</dd>
        </dl>
        <div class="setting-row">
          <div class="setting-row__label"><strong>Delete all documents</strong><span>Permanently removes every resume from this device. Cannot be undone.</span></div>
          <button type="button" class="btn btn--outline btn--sm btn--danger-text" id="wipe">Delete all…</button>
        </div>
        <div class="setting-row" id="persist-row" hidden>
          <div class="setting-row__label"><strong>Keep my data</strong><span>Ask the browser not to clear this app's storage automatically. The browser may decline.</span></div>
          <button type="button" class="btn btn--outline btn--sm" id="persist-btn">Request protection</button>
        </div>
      </section>

      <section class="setting-card" aria-labelledby="s-privacy">
        <h2 id="s-privacy">Privacy</h2>
        <ul class="prose-list">
          <li><strong>No accounts, ads or trackers.</strong> The app makes no network requests after it is installed, apart from checking for its own updates.</li>
          <li><strong>Your content stays on your device</strong> unless you deliberately download, print or share a file.</li>
          <li><strong>Documents and preferences are saved in this browser only.</strong> There is no sync, so clearing site data or switching browsers means starting over.</li>
        </ul>
        <div class="setting-row">
          <div class="setting-row__label"><strong>Reset settings</strong><span>Restores theme and motion to their defaults.</span></div>
          <button type="button" class="btn btn--outline btn--sm" id="reset">Reset</button>
        </div>
      </section>
    </div>
  </div>`;

  const $ = (sel) => root.querySelector(sel);

  // Appearance
  root.querySelectorAll('input[name="theme"], input[name="motion"]').forEach((input) =>
    input.addEventListener("change", () => {
      const saved = updateSettings({ [input.name]: input.value });
      if (!saved) toast({ message: "Could not save this setting. It will apply until you close the app.", tone: "warn" });
    }),
  );
  const unsubSettings = subscribe((next) => {
    root.querySelectorAll('input[name="theme"], input[name="motion"]').forEach((i) => {
      i.checked = next[i.name] === i.value;
    });
  });

  // Install
  const unsubInstall = mountInstallCard($("#install-mount"));

  // Connection / offline / mode
  const paintConn = () => ($("#kv-conn").textContent = navigator.onLine ? "Online" : "Offline");
  const paintOffline = () => ($("#kv-offline").textContent = OFFLINE_TEXT[getOfflineState()]);
  paintConn();
  paintOffline();
  $("#kv-mode").textContent = isStandalone() ? "Installed app" : "Browser tab";
  window.addEventListener("online", paintConn);
  window.addEventListener("offline", paintConn);
  const unsubOffline = onOfflineState(paintOffline);

  $("#check-updates").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const out = $("#update-status");
    btn.disabled = true;
    out.textContent = "Checking…";
    const result = await checkForUpdates();
    btn.disabled = false;
    out.textContent = {
      "update-ready": "A new version is ready. Use the Reload button in the notification.",
      "up-to-date": "You are on the latest version.",
      unsupported: "Updates are not available in this browser or context.",
      error: "Could not check. Are you offline?",
    }[result];
  });

  // Storage estimate / persistence (feature-detected)
  const storage = navigator.storage;
  if (storage?.estimate) {
    storage.estimate().then(
      ({ usage = 0, quota = 0 }) => {
        $("#kv-usage").textContent = quota ? `${formatBytes(usage)} of ${formatBytes(quota)} available` : formatBytes(usage);
      },
      () => ($("#kv-usage").textContent = "Unavailable"),
    );
  } else $("#kv-usage").textContent = "Unavailable in this browser";

  async function paintPersist() {
    if (!storage?.persisted) {
      $("#kv-persist").textContent = "Unavailable in this browser";
      return;
    }
    const yes = await storage.persisted();
    $("#kv-persist").textContent = yes ? "Yes" : "No (the browser may clear it under storage pressure)";
    $("#persist-row").hidden = yes || !storage.persist;
  }
  paintPersist();
  $("#persist-btn").addEventListener("click", async () => {
    const granted = await storage.persist();
    toast({ message: granted ? "Storage is now protected." : "The browser declined. Back up your documents regularly.", tone: granted ? "ok" : "warn" });
    paintPersist();
  });

  // Documents: engine + count + double-confirmed wipe
  const paintDocs = async () => {
    await settleSaves();
    const repo = await getRepository();
    $("#kv-engine").textContent = repo.persistent ? "IndexedDB (this browser)" : "Unavailable. Using temporary memory only";
    const { items, unreadable } = await repo.list();
    $("#kv-docs").textContent = `${items.length}${unreadable.length ? ` (+${unreadable.length} unreadable)` : ""}`;
  };
  paintDocs().catch(() => ($("#kv-docs").textContent = "Unavailable"));

  $("#wipe").addEventListener("click", async () => {
    const first = await confirmDialog({
      title: "Delete all documents?",
      message: "Every resume stored in this browser will be permanently deleted. There is no backup and no cloud copy.",
      confirmLabel: "Continue",
      danger: true,
    });
    if (!first) return;
    const input = h("input", { class: "input", id: "wipe-confirm", type: "text", autocomplete: "off", spellcheck: "false" });
    const typed = await openDialog({
      title: "Type DELETE to confirm",
      body: h("div", { class: "fields" }, h("label", { class: "field__label", for: "wipe-confirm", text: "Type DELETE (capital letters) to delete everything" }), input),
      initialFocus: "#wipe-confirm",
      actions: [
        { label: "Cancel", value: false, variant: "outline" },
        { label: "Delete everything", value: () => input.value.trim() === "DELETE", variant: "danger" },
      ],
    });
    if (typed !== true) return;
    try {
      await closeSession();
      const repo = await getRepository();
      await repo.clear();
      toast({ message: "All documents deleted.", tone: "ok" });
      paintDocs();
    } catch {
      toast({ message: "Could not delete documents. Storage may be unavailable.", tone: "warn" });
    }
  });

  // Reset
  $("#reset").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Reset settings?",
      message: "Theme and motion return to their defaults. No documents are affected.",
      confirmLabel: "Reset",
    });
    if (ok) {
      resetSettings();
      toast({ message: "Settings reset.", tone: "ok" });
    }
  });

  return () => {
    unsubSettings();
    unsubInstall?.();
    unsubOffline();
    window.removeEventListener("online", paintConn);
    window.removeEventListener("offline", paintConn);
  };
}
