import { icon } from "../utils/dom.js";

/** Honest "not built yet" page body. Static strings only. */
export function renderPlaceholder(root, { iconName, title, lead, phase, headline, actions = [], studio = false }) {
  const buttons = actions
    .map((a) => `<a class="btn btn--${a.variant || "outline"}" href="${a.href}">${a.label}</a>`)
    .join("");
  const frame = studio
    ? `<div class="ph-studio" aria-hidden="true">
        <div class="ph-studio__frame">
          <div class="ph-pane"><i></i><i></i><i></i><i></i></div>
          <div class="ph-pane"><i></i><i></i><i></i><i></i></div>
          <div class="ph-pane ph-pane--paper"><i></i><i></i><i></i><i></i></div>
        </div>
      </div>
      <p class="ph-studio__caption">Illustration of the planned layout. Not interactive yet.</p>`
    : "";

  root.innerHTML = `
    <div class="container page">
      <header class="page-head">
        <h1 class="page-head__title" tabindex="-1">${title}</h1>
        <p class="page-head__lead">${lead}</p>
      </header>
      <section class="empty" aria-labelledby="ph-title">
        <span class="empty__icon">${icon(iconName)}</span>
        <span class="badge badge--muted">${phase}</span>
        <h2 class="empty__title" id="ph-title">${headline}</h2>
        <div class="empty__actions">${buttons}</div>
      </section>
      ${frame}
    </div>`;
}
