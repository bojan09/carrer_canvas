import { h, icon } from "../utils/dom.js";
import { getRepository } from "../storage/repository.js";
import { settleSaves } from "../state/resume-store.js";
import { updateSettings, getSettings } from "../state/settings.js";
import { openDialog } from "../components/dialog.js";
import { toast } from "../components/toast.js";
import { announce } from "../components/announcer.js";
import { backupFileName, buildBackup, parseBackup, planImport } from "./backup.js";
import { downloadText } from "./download.js";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "unknown");

export function lastBackupText() {
  const at = getSettings().lastBackupAt;
  return at ? `Last backup: ${fmt(at)}` : "No backup yet";
}

/** Back up one document or all of them. Resolves true when a file was produced. */
export async function backupFlow({ docIds = null } = {}) {
  await settleSaves();
  const repo = await getRepository();
  const { items, unreadable } = await repo.list();
  const docs = docIds ? items.filter((d) => docIds.includes(d.id)) : items;
  if (!docs.length) {
    toast({ message: "There are no documents to back up yet.", tone: "warn" });
    return false;
  }
  const hasPhoto = docs.some((d) => d.photo);
  const photos = h("input", { type: "checkbox", class: "check__input", id: "bk-photos" });
  const body = h(
    "div",
    {},
    h("p", { text: `${docs.length} document${docs.length === 1 ? "" : "s"} will be saved to a JSON file on this device.` }),
    h("p", { class: "notice notice--warn" }, h("span", { text: "The file holds your name, contact details and work history as plain text. Keep it somewhere private and do not share it unless you mean to." })),
    hasPhoto ? h("label", { class: "check", for: "bk-photos" }, photos, h("span", { text: "Include photos (makes the file larger and more sensitive)" })) : null,
    unreadable.length ? h("p", { class: "field__hint", text: `${unreadable.length} unreadable stored document${unreadable.length === 1 ? " is" : "s are"} not included.` }) : null,
    h("p", { class: "field__hint", text: "Nothing is uploaded. To restore, use Restore from backup on this device or another one." }),
  );
  const ok = await openDialog({
    title: "Back up your documents",
    body,
    actions: [
      { label: "Cancel", value: false, variant: "outline" },
      { label: "Download backup", value: true, variant: "primary" },
    ],
  });
  if (!ok) return false;
  const backup = buildBackup(docs, { includePhotos: hasPhoto && photos.checked });
  downloadText(backupFileName(new Date(), docIds ? docs[0].title : null), JSON.stringify(backup, null, 2));
  updateSettings({ lastBackupAt: new Date().toISOString() });
  toast({ message: "Backup file created. Check your downloads.", tone: "ok" });
  announce("Backup file created.");
  return true;
}

function pickFile() {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: "application/json,.json", class: "sr-only", tabindex: "-1" });
    input.addEventListener("change", () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

/** Restore flow: choose file, validate, preview, choose how to treat duplicates, import.
 *  @returns {Promise<boolean>} true when something was written */
export async function restoreFlow() {
  const file = await pickFile();
  if (!file) return false;
  if (file.size > 30 * 1024 * 1024) {
    toast({ message: "That file is too large to be a CareerCanvas backup.", tone: "warn" });
    return false;
  }
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) {
    await openDialog({ title: "Can't restore this file", body: parsed.error, actions: [{ label: "Close", value: true, variant: "primary" }] });
    return false;
  }
  if (!parsed.documents.length) {
    await openDialog({
      title: "Nothing to restore",
      body: h("div", {}, h("p", { text: "No usable documents were found in this file." }), parsed.rejected.length ? h("ul", { class: "prose-list" }, parsed.rejected.map((r) => h("li", { text: `“${r.label}” ${r.reason}.` }))) : null),
      actions: [{ label: "Close", value: true, variant: "primary" }],
    });
    return false;
  }

  await settleSaves();
  const repo = await getRepository();
  const { items } = await repo.list();
  const existing = new Set(items.map((d) => d.id));
  const clashes = parsed.documents.filter((d) => existing.has(d.id));

  const strategyName = "restore-strategy";
  const strategies = [
    ["copy", "Keep both (import copies)", "Existing documents stay as they are."],
    ["replace", "Replace existing documents", "Overwrites the local version, including its photo if the backup has none."],
    ["skip", "Skip documents I already have", "Only new documents are added."],
  ];
  const radios = h(
    "fieldset",
    { class: "mode" },
    h("legend", { class: "field__label", text: `${clashes.length} document${clashes.length === 1 ? "" : "s"} already exist${clashes.length === 1 ? "s" : ""} on this device` }),
    ...strategies.map(([value, label, hint], i) => {
      const input = h("input", { type: "radio", name: strategyName, value, class: "check__input" });
      input.checked = i === 0;
      return h("label", { class: "check restore__option" }, input, h("span", {}, h("strong", { text: label }), h("small", { text: hint })));
    }),
  );
  const list = h(
    "ul",
    { class: "restore__list" },
    parsed.documents.slice(0, 50).map((d) => h("li", {}, h("strong", { text: d.title }), h("span", { text: ` · edited ${fmt(d.updatedAt)}${d.photo ? " · has photo" : ""}${existing.has(d.id) ? " · already here" : ""}` }))),
  );
  const body = h(
    "div",
    {},
    h("p", { text: `Found ${parsed.documents.length} document${parsed.documents.length === 1 ? "" : "s"}${parsed.meta.exportedAt ? ` (backup made ${fmt(parsed.meta.exportedAt)})` : ""}.` }),
    list,
    parsed.documents.length > 50 ? h("p", { class: "field__hint", text: `…and ${parsed.documents.length - 50} more.` }) : null,
    parsed.rejected.length ? h("div", { class: "notice notice--warn" }, h("div", {}, h("strong", { text: `${parsed.rejected.length} item${parsed.rejected.length === 1 ? "" : "s"} will be skipped:` }), h("ul", { class: "prose-list" }, parsed.rejected.slice(0, 8).map((r) => h("li", { text: `“${r.label}” ${r.reason}.` }))))) : null,
    clashes.length ? radios : null,
  );
  const choice = await openDialog({
    title: "Restore from backup",
    body,
    actions: [
      { label: "Cancel", value: null, variant: "outline" },
      { label: "Restore", value: () => body.querySelector(`input[name="${strategyName}"]:checked`)?.value || "copy", variant: "primary" },
    ],
  });
  if (!choice) return false;

  const { toWrite, summary } = planImport(parsed.documents, existing, choice);
  let written = 0;
  try {
    for (const doc of toWrite) {
      await repo.put(doc);
      written += 1;
    }
  } catch (err) {
    toast({
      message: `${err?.name === "QuotaExceededError" ? "Storage is full" : "Storage error"}. ${written} of ${toWrite.length} documents were restored.`,
      tone: "warn",
      duration: 9000,
    });
    return written > 0;
  }
  const parts = [summary.added && `${summary.added} added`, summary.copied && `${summary.copied} copied`, summary.replaced && `${summary.replaced} replaced`, summary.skipped && `${summary.skipped} skipped`].filter(Boolean);
  toast({ message: `Restore complete: ${parts.join(", ") || "nothing changed"}.`, tone: "ok", duration: 8000 });
  announce("Restore complete.");
  return written > 0;
}

export const backupIcon = (name) => icon(name);
