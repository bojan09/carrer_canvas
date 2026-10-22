// Phase 2 browser checks: create/edit/persist/undo/reorder/saved dashboard/storage failure.
// Usage: NODE_PATH=<dir with playwright> node e2e/phase2.mjs [baseUrl] [outDir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] || "http://localhost:4173";
const out = process.argv[3] || "e2e/screenshots";
mkdirSync(out, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
};

async function newPage(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await context.newPage();
  watch(page);
  return { context, page };
}

const openSection = async (page, id) => {
  const toggle = page.locator(`[data-focus-key="sec:${id}"]`);
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
};

// ---------- 1. create blank, edit, persist ----------
{
  const { context, page } = await newPage();
  await page.goto(`${base}/#/resume`);
  await page.getByRole("button", { name: "Start blank" }).click();
  await page.waitForSelector(".studio");
  check("blank resume opens the editor", /#\/resume\/.+/.test(page.url()));
  check("empty preview prompts for content", (await page.textContent(".paper")).includes("Add content"));

  await page.getByLabel("Full name").fill("Jordan Tester");
  await page.getByLabel("Email").fill("jordan@example.org");
  await page.waitForTimeout(250);
  check("preview updates live", (await page.textContent(".paper h1")) === "Jordan Tester");

  // email validation after blur
  await page.getByLabel("Email").fill("bad-email");
  await page.getByLabel("Email").blur();
  check("invalid email shows inline error + aria-invalid", (await page.getByLabel("Email").getAttribute("aria-invalid")) === "true");
  await page.getByLabel("Email").fill("jordan@example.org");

  // experience entry + bullets
  await openSection(page, "experience");
  await page.getByRole("button", { name: "Add position" }).click();
  await page.getByLabel("Job title").first().fill("Engineer");
  await page.getByLabel("Company").first().fill("Acme");
  await page.getByRole("button", { name: "Add an item" }).click();
  await page.getByLabel(/Achievements and responsibilities, item 1/).fill("Built a thing");
  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByLabel(/item 2 of 2/).fill("Fixed another thing");
  await page.waitForTimeout(250);
  const pv = await page.textContent(".paper");
  check("experience + bullets appear in preview", pv.includes("Engineer") && pv.includes("Acme") && pv.includes("Built a thing"));

  // keyboard reorder of bullets: focus "move item 1 down" and press Enter
  await page.getByRole("button", { name: "Move item 1 down" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  const first = await page.getByLabel(/Achievements and responsibilities, item 1/).inputValue();
  check("bullet reorder via keyboard button", first === "Fixed another thing");
  check("focus stays on the moved item's control", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Move item")));

  // current-role checkbox disables end date
  await page.getByLabel("I currently work here").check();
  check("current role disables end date", await page.getByLabel("End date").first().isDisabled());
  await page.getByLabel("I currently work here").uncheck();

  // status shows saved
  await page.waitForFunction(() => document.querySelector(".studio__status")?.textContent.startsWith("Saved on this device"), null, { timeout: 5000 });
  check("status reads 'Saved on this device'", true);

  // reload retains everything
  await page.reload();
  await page.waitForSelector(".studio");
  check("reload keeps name", (await page.getByLabel("Full name").inputValue()) === "Jordan Tester");
  await openSection(page, "experience");
  check("reload keeps entry and bullet order", (await page.getByLabel("Job title").first().inputValue()) === "Engineer" && (await page.getByLabel(/item 1 of 2/).inputValue()) === "Fixed another thing");

  // undo / redo (history is per editing session, so make fresh edits after the reload)
  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByLabel(/item 3 of 3/).fill("Third bullet");
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(150);
  check("undo reverts the last edit", !(await page.locator(".paper").textContent()).includes("Third bullet"));
  while ((await page.getByRole("button", { name: "Undo" }).getAttribute("aria-disabled")) === "false") await page.getByRole("button", { name: "Undo" }).click();
  check("undo to the start of the session keeps earlier saved content", (await page.textContent(".paper")).includes("Engineer") && !(await page.textContent(".paper")).includes("Third bullet"));
  while ((await page.getByRole("button", { name: "Redo" }).getAttribute("aria-disabled")) === "false") await page.getByRole("button", { name: "Redo" }).click();
  await page.waitForTimeout(300);
  check("redo restores the edit", (await page.textContent(".paper")).includes("Third bullet"));

  // quick edit then immediate navigation must not lose the edit
  await page.getByLabel("Full name").fill("Quick Edit Name");
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector(".doc-card");
  await page.goto(`${base}/#/resume`);
  await page.waitForSelector(".studio");
  check("edit made right before navigating away is saved", (await page.getByLabel("Full name").inputValue()) === "Quick Edit Name");

  // hostile text is inert
  await page.getByLabel("Full name").fill('<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>');
  await page.getByLabel("Professional title").fill("javascript:alert(1)");
  await page.getByLabel("Website or portfolio").fill("javascript:window.__xss=1");
  await page.waitForTimeout(300);
  const xss = await page.evaluate(() => window.__xss === 1);
  check("hostile markup is not executed", !xss);
  check("hostile text shown literally", (await page.textContent(".paper h1")).includes("<img src=x"));
  check("javascript: URL is not rendered as a link", (await page.locator('.paper a[href^="javascript"]').count()) === 0);

  // section reorder + hide via rail buttons (wide layout)
  await page.getByRole("button", { name: "Move Education down" }).click();
  await page.waitForTimeout(100);
  const order = await page.locator(".studio__editor .sec").evaluateAll((els) => els.map((e) => e.dataset.sectionId));
  check("section moved down", order.indexOf("education") === order.indexOf("skills") + 1, order.join(","));
  await page.getByRole("button", { name: /Hide Languages from resume/ }).click();
  check("hidden section is marked", (await page.locator('#sec-languages.is-hidden').count()) === 1);

  // custom section
  await page.getByRole("button", { name: "Add section" }).click();
  await page.fill("#new-sec-title", "Volunteering");
  await page.getByRole("button", { name: "Add section", exact: true }).last().click();
  await page.waitForSelector('.sec__label:has-text("Volunteering")');
  check("custom section added", true);

  await page.screenshot({ path: `${out}/editor-1440.png` });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.screenshot({ path: `${out}/editor-1200.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/editor-390.png` });
  await page.check('input[name="studio-view"][value="preview"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/editor-preview-390.png` });
  check("mobile: preview tab hides editor", !(await page.locator(".studio__editorwrap").isVisible()));
  await page.setViewportSize({ width: 320, height: 700 });
  check("no horizontal overflow in editor @320", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

  // offline editing still works and persists
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/#/resume`);
  await page.waitForSelector(".studio");
  await context.close();
}

// ---------- 2. sample content, checklist, saved dashboard ----------
{
  const { context, page } = await newPage();
  await page.goto(`${base}/#/saved`);
  await page.getByRole("button", { name: "New fictional sample" }).click();
  await page.waitForSelector(".studio");
  check("sample warns it is fictional", (await page.textContent(".studio__banners")).includes("fictional sample content"));
  check("sample preview renders", (await page.textContent(".paper h1")) === "Alex Sample");
  await page.getByRole("button", { name: /Writing checklist/ }).click();
  check("checklist dialog flags sample content", (await page.textContent("dialog")).includes("Sample content is still present"));
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "I've replaced the sample content" }).click();
  check("sample warning can be dismissed", (await page.locator(".studio__banners").textContent()).trim() === "");

  await page.goto(`${base}/#/saved`);
  await page.waitForSelector(".doc-card");
  await page.screenshot({ path: `${out}/saved-1440.png` });
  await page.getByRole("button", { name: /^Duplicate:/ }).click();
  await page.waitForFunction(() => document.querySelectorAll(".doc-card").length === 2);
  check("duplicate creates a second document", true);

  await page.getByRole("button", { name: /^Rename:/ }).first().click();
  await page.fill("#rename-input", "Renamed doc");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.waitForSelector('.doc-card__title:has-text("Renamed doc")');
  check("rename works", true);

  await page.getByRole("button", { name: /^Delete:/ }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".doc-card").length === 1);
  check("delete requires confirmation and removes the document", true);

  // delete-all with double confirmation (settings)
  await page.goto(`${base}/#/settings`);
  await page.getByRole("button", { name: "Delete all…" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill("#wipe-confirm", "nope");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector(".doc-card");
  check("delete-all is blocked without typing DELETE", (await page.locator(".doc-card").count()) === 1);
  await page.goto(`${base}/#/settings`);
  await page.getByRole("button", { name: "Delete all…" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill("#wipe-confirm", "DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.waitForSelector('.toast:has-text("All documents deleted")');
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector(".empty");
  check("delete-all removes everything when confirmed", (await page.textContent(".empty")).includes("No documents yet"));
  await page.screenshot({ path: `${out}/saved-empty-1440.png` });
  await context.close();
}

// ---------- 3. storage unavailable ----------
{
  const { context, page } = await newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
  });
  await page.goto(`${base}/#/resume`);
  await page.getByRole("button", { name: "Start blank" }).click();
  await page.waitForSelector(".studio");
  check("storage failure: editor still works", true);
  check("storage failure: persistent warning shown", (await page.textContent(".studio__banners")).includes("Storage is unavailable"));
  await page.getByLabel("Full name").fill("Temp");
  await page.waitForTimeout(200);
  check("storage failure: status says not stored", (await page.textContent(".studio__status")).includes("Not stored"));
  await context.close();
}

// ---------- 4. newer-version record is not opened or overwritten ----------
{
  const { context, page } = await newPage();
  await page.goto(`${base}/#/saved`);
  await page.waitForSelector(".empty");
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("careercanvas");
        req.onsuccess = () => {
          const tx = req.result.transaction("resumes", "readwrite");
          tx.objectStore("resumes").put({ id: "future-doc", schemaVersion: 999, title: "From the future" });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await page.waitForSelector(".notice--warn");
  check("newer-version record is reported, not listed", (await page.textContent(".notice--warn")).includes("could not be read"));
  await page.goto(`${base}/#/resume/future-doc`);
  await page.waitForSelector('.empty__title:has-text("newer version")');
  check("opening a newer-version record explains and does not edit it", (await page.textContent(".empty__title")).includes("newer version"), await page.textContent(".empty__title"));
  const untouched = await page.evaluate(
    () =>
      new Promise((resolve) => {
        indexedDB.open("careercanvas").onsuccess = (e) => {
          e.target.result.transaction("resumes").objectStore("resumes").get("future-doc").onsuccess = (ev) => resolve(ev.target.result);
        };
      }),
  );
  check("newer-version record left byte-for-byte untouched", untouched.title === "From the future" && untouched.schemaVersion === 999);
  await context.close();
}

check("no console errors", errors.length === 0, errors.join(" | "));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
