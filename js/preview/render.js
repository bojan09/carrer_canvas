import { h } from "../utils/dom.js";
import { safeUrl } from "../utils/sanitization.js";
import { isEmpty, titleOf } from "../editors/hints.js";
import { getTemplate } from "../templates/registry.js";
import { BASE_FONT_PX, FONT_PAIRS, MM, PAPER, photoVisible, renderTemplateOf, resolveDesign } from "../templates/design.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtMonth(v) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v || "");
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : v || "";
}

export function dateRange(start, end, current) {
  const a = fmtMonth(start);
  const b = current ? "Present" : fmtMonth(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || "";
}

/** A safe external link: text via textContent, href only when it is a valid http(s) URL. */
function link(text, url) {
  const href = safeUrl(url);
  if (!href) return document.createTextNode(text || url || "");
  return h("a", { href, target: "_blank", rel: "noopener noreferrer", text: text || href.replace(/^https?:\/\//, "").replace(/\/$/, "") });
}

function bulletList(bullets) {
  const items = bullets.filter((b) => b.text.trim());
  return items.length ? h("ul", { class: "doc__bullets" }, items.map((b) => h("li", { text: b.text }))) : null;
}

function entry(headline, sub, dates, extra) {
  return h(
    "div",
    { class: "doc__entry" },
    h("div", { class: "doc__entry-head" }, h("strong", { class: "doc__entry-title", text: headline }), dates ? h("span", { class: "doc__dates", text: dates }) : null),
    sub ? h("div", { class: "doc__entry-sub", text: sub }) : null,
    extra || null,
  );
}

function skillBlock(items, style) {
  if (style === "chips") {
    return h("ul", { class: "doc__chips" }, items.map((t) => h("li", { text: t })));
  }
  return h("p", { class: "doc__skills-text", text: items.join(", ") });
}

function sectionBody(s, skillsStyle) {
  const body = [];
  switch (s.type) {
    case "summary":
      body.push(h("p", { class: "doc__text", text: s.text }));
      break;
    case "experience":
      s.items.forEach((e) => body.push(entry(e.title || "Untitled position", [e.organization, e.location].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate, e.current), bulletList(e.bullets))));
      break;
    case "education":
      s.items.forEach((e) => body.push(entry(e.program || "Untitled program", [e.school, e.location].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate, false), e.details ? h("p", { class: "doc__text", text: e.details }) : null)));
      break;
    case "skills":
      s.items.forEach((e) =>
        body.push(h("div", { class: "doc__skillgroup" }, e.label ? h("strong", { class: "doc__skilllabel", text: e.label }) : null, skillBlock(e.items, skillsStyle))),
      );
      break;
    case "projects":
      s.items.forEach((e) =>
        body.push(entry(e.name || "Untitled project", e.role, dateRange(e.startDate, e.endDate, false), h("div", {}, e.url ? h("div", { class: "doc__entry-sub" }, link("", e.url)) : null, bulletList(e.bullets)))),
      );
      break;
    case "certifications":
      s.items.forEach((e) => body.push(entry(e.title || "Untitled certification", e.issuer, fmtMonth(e.date), e.url ? h("div", { class: "doc__entry-sub" }, link("Credential", e.url)) : null)));
      break;
    case "languages":
      s.items.forEach((e) => body.push(h("p", { class: "doc__lang" }, h("strong", { text: e.language || "Language" }), e.proficiency ? document.createTextNode(` (${e.proficiency})`) : null)));
      break;
    case "custom":
      body.push(s.mode === "bullets" ? bulletList(s.bullets) : h("p", { class: "doc__text", text: s.text }));
      break;
  }
  return body;
}

function renderSection(s, skillsStyle) {
  return h("section", { class: "doc__section", "data-type": s.type }, h("h2", { class: "doc__heading", text: titleOf(s) }), sectionBody(s, skillsStyle));
}

/**
 * Canonical resume tree. All templates share this markup; they differ only by CSS
 * (css/templates/*.css) and, for two-column layouts, by which sections go to the sidebar.
 * Reading order in the DOM is always: header, main sections, sidebar sections.
 * @param {object} doc the resume
 * @param {{templateId?: string}} [opts] templateId overrides doc.templateId (used by the gallery)
 */
export function renderResume(doc, opts = {}) {
  const source = opts.templateId ? { ...doc, templateId: opts.templateId } : doc;
  const design = resolveDesign(source);
  const tpl = renderTemplateOf(source);
  const chosen = getTemplate(source.templateId);
  const paper = PAPER[doc.pageSize] || PAPER.A4;
  const showPhoto = photoVisible(source);
  const c = doc.contact;

  const contactBits = [
    c.email && document.createTextNode(c.email),
    c.phone && document.createTextNode(c.phone),
    c.location && document.createTextNode(c.location),
    c.website && link("", c.website),
    c.linkedin && link("", c.linkedin),
    ...doc.links.filter((l) => l.url).map((l) => link(l.label, l.url)),
  ].filter(Boolean);

  const header = h(
    "header",
    { class: "doc__header" },
    showPhoto ? h("img", { class: "doc__photo", src: doc.photo.data, alt: "", width: "96", height: "96" }) : null,
    h("div", { class: "doc__id" }, h("h1", { class: "doc__name", text: c.fullName || "Your name" }), c.title ? h("p", { class: "doc__role", text: c.title }) : null),
    contactBits.length ? h("ul", { class: "doc__contact" }, contactBits.map((n) => h("li", {}, n))) : null,
  );

  const visible = doc.sectionOrder.map((id) => doc.sections[id]).filter((s) => s.visible && !isEmpty(s));
  const skillsStyle = tpl.skills;
  const twoCol = tpl.layout !== "single";
  const main = visible.filter((s) => !(twoCol && tpl.side.includes(s.type)));
  const side = twoCol ? visible.filter((s) => tpl.side.includes(s.type)) : [];

  const empty = h("p", { class: "doc__empty", text: "Add content on the left and it appears here." });
  const body = h("div", { class: "doc__body" }, h("div", { class: "doc__main" }, main.length || side.length ? main.map((s) => renderSection(s, skillsStyle)) : empty));
  if (side.length) body.append(h("aside", { class: "doc__side", "aria-label": "Additional details" }, side.map((s) => renderSection(s, skillsStyle))));

  const root = h("article", {
    class: "doc",
    "aria-label": "Resume preview",
    "data-template": tpl.id,
    "data-chosen": chosen.id,
    "data-layout": side.length ? tpl.layout : "single",
    "data-divider": design.dividerStyle,
    "data-align": design.headerAlign,
    "data-photo": showPhoto ? design.photoShape : "none",
    "data-simplified": design.simplified ? "true" : "false",
  });
  const font = FONT_PAIRS[design.fontPair];
  const vars = {
    "--paper-w": `${paper.w}px`,
    "--paper-h": `${paper.h}px`,
    "--accent": design.accent,
    "--fs": `${(BASE_FONT_PX * design.bodyScale).toFixed(2)}px`,
    "--title-scale": String(design.titleScale),
    "--lh": String(design.lineHeight),
    "--gap": `${design.sectionGap}px`,
    "--margin": `${(design.margins * MM).toFixed(1)}px`,
    "--font-head": font.head,
    "--font-body": font.body,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.append(header, body);
  return root;
}
