import { CATEGORIES, TEMPLATES } from "../data/templates-meta.js";
import { templateCardHTML } from "../components/template-card.js";
import { icon } from "../utils/dom.js";

export default function templates(root) {
  root.innerHTML = `
  <div class="container page">
    <header class="page-head">
      <h1 class="page-head__title" tabindex="-1">Choose a template</h1>
      <p class="page-head__lead">Eight designs that make your content stand out. Pick based on the role and where you apply, not just the colour.</p>
    </header>
    <p class="notice">${icon("info")}<span>Live previews and <em>Use template</em> arrive in Phase 3. This gallery shows the planned set. ATS-conscious is a design goal, not a guarantee of how any employer's system reads your resume.</span></p>
    <div class="chips" role="group" aria-label="Filter templates by style" id="chips"></div>
    <p class="template-count" id="count" role="status" aria-live="polite"></p>
    <div class="template-grid" id="grid"></div>
  </div>`;

  const chips = root.querySelector("#chips");
  const grid = root.querySelector("#grid");
  const count = root.querySelector("#count");
  let active = "All";

  chips.innerHTML = CATEGORIES.map(
    (c) => `<button type="button" class="chip" data-cat="${c}" aria-pressed="${c === active}">${c}</button>`,
  ).join("");

  function draw() {
    const list = active === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.categories.includes(active));
    grid.innerHTML = list.map((t) => templateCardHTML(t)).join("");
    count.textContent = `${list.length} ${list.length === 1 ? "template" : "templates"}${active === "All" ? "" : ` in ${active}`}`;
  }

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cat]");
    if (!btn) return;
    active = btn.dataset.cat;
    chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
    draw();
  });

  draw();
}
