import { h } from "../utils/dom.js";
import { safeUrl } from "../utils/sanitization.js";
import { isEmpty, titleOf } from "../editors/hints.js";
import { getTemplate } from "../templates/registry.js";
import { formatLetterDate, isLetter } from "../models/cover-letter.js";
import { BASE_FONT_PX, FONT_FAMILIES, FONT_PAIRS, MM, PAPER, effectiveFill, photoVisible, readableInk, renderTemplateOf, resolveDesign } from "../templates/design.js";

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
  return items.length ? h("ul", { class: "doc__bullets", "data-role": "body" }, items.map((b) => h("li", { text: b.text }))) : null;
}

function entry(headline, sub, dates, extra) {
  return h(
    "div",
    { class: "doc__entry" },
    h("div", { class: "doc__entry-head" }, h("strong", { class: "doc__entry-title", "data-role": "title", text: headline }), dates ? h("span", { class: "doc__dates", "data-role": "meta", text: dates }) : null),
    sub ? h("div", { class: "doc__entry-sub", "data-role": "meta", text: sub }) : null,
    extra || null,
  );
}

function skillBlock(items, style) {
  if (style === "chips") {
    return h("ul", { class: "doc__chips", "data-role": "body" }, items.map((t) => h("li", { text: t })));
  }
  return h("p", { class: "doc__skills-text", "data-role": "body", text: items.join(", ") });
}

function sectionBody(s, skillsStyle) {
  const body = [];
  switch (s.type) {
    case "summary":
      body.push(h("p", { class: "doc__text", "data-role": "body", text: s.text }));
      break;
    case "experience":
      s.items.forEach((e) => body.push(entry(e.title || "Untitled position", [e.organization, e.location].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate, e.current), bulletList(e.bullets))));
      break;
    case "education":
      s.items.forEach((e) => body.push(entry(e.program || "Untitled program", [e.school, e.location].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate, false), e.details ? h("p", { class: "doc__text", "data-role": "body", text: e.details }) : null)));
      break;
    case "skills":
      s.items.forEach((e) =>
        body.push(h("div", { class: "doc__skillgroup" }, e.label ? h("strong", { class: "doc__skilllabel", "data-role": "title", text: e.label }) : null, skillBlock(e.items, skillsStyle))),
      );
      break;
    case "projects":
      s.items.forEach((e) =>
        body.push(entry(e.name || "Untitled project", e.role, dateRange(e.startDate, e.endDate, false), h("div", {}, e.url ? h("div", { class: "doc__entry-sub", "data-role": "meta" }, link("", e.url)) : null, bulletList(e.bullets)))),
      );
      break;
    case "certifications":
      s.items.forEach((e) => body.push(entry(e.title || "Untitled certification", e.issuer, fmtMonth(e.date), e.url ? h("div", { class: "doc__entry-sub", "data-role": "meta" }, link("Credential", e.url)) : null)));
      break;
    case "languages":
      s.items.forEach((e) => body.push(h("p", { class: "doc__lang", "data-role": "body" }, h("strong", { text: e.language || "Language" }), e.proficiency ? document.createTextNode(` (${e.proficiency})`) : null)));
      break;
    case "custom":
      body.push(s.mode === "bullets" ? bulletList(s.bullets) : h("p", { class: "doc__text", "data-role": "body", text: s.text }));
      break;
  }
  return body;
}

function renderSection(s, skillsStyle) {
  return h("section", { class: "doc__section", "data-type": s.type, "data-move": `sec:${s.id}`, "data-move-label": titleOf(s) }, h("h2", { class: "doc__heading", "data-role": "heading", text: titleOf(s) }), sectionBody(s, skillsStyle));
}

/** Shared document frame: header (photo, name, role, contact) plus a body built by `makeBody`.
 *  Templates style this one structure, so resumes and cover letters match. */
function frame(doc, opts, kind, makeBody) {
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
    showPhoto ? h("img", { class: "doc__photo", "data-role": "photo", src: doc.photo.data, alt: "", width: "96", height: "96" }) : null,
    h("div", { class: "doc__id", "data-move": "identity", "data-move-label": "Name and title" }, h("h1", { class: "doc__name", "data-role": "name", text: c.fullName || "Your name" }), c.title ? h("p", { class: "doc__role", "data-role": "role", text: c.title }) : null),
    contactBits.length ? h("ul", { class: "doc__contact", "data-role": "contact", "data-move": "contact", "data-move-label": "Contact details" }, contactBits.map((n) => h("li", {}, n))) : null,
  );

  const { body, hasSide } = makeBody(tpl);

  const root = h("article", {
    class: "doc",
    "aria-label": kind === "letter" ? "Cover letter preview" : "Resume preview",
    "data-kind": kind,
    "data-template": tpl.id,
    "data-chosen": chosen.id,
    "data-layout": hasSide ? tpl.layout : "single",
    "data-divider": design.dividerStyle,
    "data-align": design.headerAlign,
    "data-photo": showPhoto ? design.photoShape : "none",
    "data-simplified": design.simplified ? "true" : "false",
    "data-mirror": design.mirror && tpl.supports.mirror ? "true" : "false",
    "data-date-align": design.dateAlign,
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
  // User colour and transparency overrides. A template that prints on white (dark on screen) keeps its own
  // text colours on paper, because light text chosen for a dark screen would vanish on white.
  const keepTextColours = opts.forPrint && tpl.printsOnWhite;
  if (design.textColor && !keepTextColours) {
    vars["--ink"] = design.textColor;
    vars["--ink-strong"] = design.textColor;
  }
  if (design.mutedColor && !keepTextColours) vars["--ink-2"] = design.mutedColor;
  if (tpl.supports.fills) {
    if (design.fillColor) vars["--deco-c"] = design.fillColor;
    if (design.fillOpacity !== 1) vars["--fill-o"] = String(design.fillOpacity);
    if (tpl.headerInk && (design.fillColor || design.fillOpacity !== 1)) vars["--hdr-ink"] = readableInk(effectiveFill(tpl, design), design.fillOpacity, tpl.printsOnWhite && opts.forPrint ? "#ffffff" : tpl.paperBg);
  }
  if (design.photoOpacity !== 1) vars["--photo-o"] = String(design.photoOpacity);

  // Per-element formatting: each setting becomes a CSS variable plus a token on data-st that switches on the
  // matching rule in css/templates/elements.css. Colours are skipped on paper for dark-on-screen templates.
  const tokens = [];
  for (const [role, el] of Object.entries(design.elements)) {
    const add = (prop, value) => {
      tokens.push(`${role}-${prop}`);
      if (value !== undefined) vars[`--el-${role}-${prop}`] = String(value);
    };
    if (el.color && !keepTextColours) add("color", el.color);
    if (el.font) add("font", FONT_FAMILIES[el.font].stack);
    if (el.weight) add("weight", el.weight);
    if (el.size) add("size", el.size);
    if (el.track !== undefined) add("track", el.track);
    if (el.italic === true) add("italic");
    if (el.upper !== undefined) add(el.upper ? "upper-on" : "upper-off");
    if (el.align) {
      add("align", el.align);
      vars[`--el-${role}-justify`] = { left: "flex-start", center: "center", right: "flex-end", justify: "flex-start" }[el.align];
    }
  }
  if (design.photoSize !== undefined) {
    tokens.push("photo-size");
    vars["--photo-size"] = String(design.photoSize);
  }
  if (design.photoX !== undefined || design.photoY !== undefined) {
    tokens.push("photo-move");
    vars["--photo-x"] = String(design.photoX ?? 0);
    vars["--photo-y"] = String(design.photoY ?? 0);
  }
  if (tokens.length) root.setAttribute("data-st", tokens.join(" "));
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.append(header, body);
  // Moved blocks: a CSS translate in millimetres. Layout, page breaks and reading order are unchanged.
  // Simplified (ATS-conscious) mode ignores moves so the page stays a plain single column.
  if (!design.simplified) {
    for (const node of root.querySelectorAll("[data-move]")) {
      const m = design.moves[node.dataset.move];
      if (!m) continue;
      node.setAttribute("data-moved", "true");
      node.style.setProperty("--mv-x", `${m.x}mm`);
      node.style.setProperty("--mv-y", `${m.y}mm`);
    }
  }
  return root;
}

/**
 * Canonical resume tree. All templates share this markup; they differ only by CSS
 * (css/templates/*.css) and, for two-column layouts, by which sections go to the sidebar.
 * Reading order in the DOM is always: header, main sections, sidebar sections.
 * @param {object} doc the resume
 * @param {{templateId?: string}} [opts] templateId overrides doc.templateId (used by the gallery)
 */
export function renderResume(doc, opts = {}) {
  return frame(doc, opts, "resume", (tpl) => {
    const visible = doc.sectionOrder.map((id) => doc.sections[id]).filter((s) => s.visible && !isEmpty(s));
    const skillsStyle = tpl.skills;
    const twoCol = tpl.layout !== "single";
    const main = visible.filter((s) => !(twoCol && tpl.side.includes(s.type)));
    const side = twoCol ? visible.filter((s) => tpl.side.includes(s.type)) : [];

    const empty = h("p", { class: "doc__empty", text: "Add content on the left and it appears here." });
    const body = h("div", { class: "doc__body" }, h("div", { class: "doc__main" }, main.length || side.length ? main.map((s) => renderSection(s, skillsStyle)) : empty));
    if (side.length) body.append(h("aside", { class: "doc__side", "aria-label": "Additional details" }, side.map((s) => renderSection(s, skillsStyle))));
    return { body, hasSide: side.length > 0 };
  });
}

const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const paras = (text, cls) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => h("p", { class: cls, "data-role": "body", text: p }));

/** Cover letter tree: the same header as the resume, then one borderless block of letter parts.
 *  Layout is always single column (a letter has no sidebar content). */
export function renderLetter(doc, opts = {}) {
  return frame(doc, opts, "letter", () => {
    const r = doc.recipient;
    const date = formatLetterDate(doc.date);
    const recipientLines = [r.name, r.title, r.company, ...lines(r.address)].filter(Boolean);
    const parts = [
      date ? h("p", { class: "doc__date", "data-move": "date", "data-move-label": "Date", "data-role": "meta", text: date }) : null,
      recipientLines.length ? h("address", { class: "doc__recipient", "data-move": "recipient", "data-move-label": "Recipient", "data-role": "meta" }, recipientLines.map((l) => h("span", { text: l }))) : null,
      doc.role.trim() ? h("p", { class: "doc__subject", "data-move": "subject", "data-move-label": "Subject line", "data-role": "title", text: `Re: ${doc.role.trim()}` }) : null,
      doc.greeting.trim() ? h("p", { class: "doc__greeting", "data-move": "greeting", "data-move-label": "Greeting", "data-role": "body", text: doc.greeting.trim() }) : null,
      ...paras(doc.opening, "doc__para"),
      ...doc.body.flatMap((p) => paras(p.text, "doc__para")),
      doc.closing.trim() ? h("p", { class: "doc__closing", "data-move": "closing", "data-move-label": "Closing", "data-role": "body", text: doc.closing.trim() }) : null,
      doc.signature.trim() ? h("p", { class: "doc__signature", "data-move": "signature", "data-move-label": "Signature", "data-role": "title", text: doc.signature.trim() }) : null,
    ].filter(Boolean);
    const content = parts.length ? parts : [h("p", { class: "doc__empty", text: "Write your letter on the left and it appears here." })];
    const body = h("div", { class: "doc__body" }, h("div", { class: "doc__main" }, h("section", { class: "doc__section doc__letter", "data-type": "letter" }, content)));
    return { body, hasSide: false };
  });
}

/** Renders whichever kind of document this is. */
export const renderDocument = (doc, opts = {}) => (isLetter(doc) ? renderLetter(doc, opts) : renderResume(doc, opts));
