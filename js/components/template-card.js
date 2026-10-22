/** Static markup for template thumbnails/cards. All inputs come from templates-meta.js. */

export function thumbHTML(id) {
  return `<div class="thumb thumb--${id}" aria-hidden="true"><div class="thumb__side"></div><div class="thumb__main"><i class="t-name"></i><i class="t-role"></i><i></i><i></i><i></i><i class="t-h"></i><i></i><i></i><i></i><i class="t-h"></i><i></i><i></i><i></i></div></div>`;
}

export function templateCardHTML(t, { tag = "article", href = "" } = {}) {
  const open = href ? `<a class="template-card" href="${href}">` : `<${tag} class="template-card">`;
  const close = href ? "</a>" : `</${tag}>`;
  const badges = t.tags.map((b) => `<span class="badge badge--${b.tone}">${b.label}</span>`).join("");
  return `${open}
    ${thumbHTML(t.id)}
    <div class="template-card__meta">
      <h3 class="template-card__name">${t.name}</h3>
      <p class="template-card__blurb">${t.blurb}</p>
      <div class="template-card__tags">${badges}<span class="badge badge--muted">Preview in Phase 3</span></div>
    </div>
  ${close}`;
}
