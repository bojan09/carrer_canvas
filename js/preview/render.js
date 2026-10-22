import { h } from "../utils/dom.js";
import { safeUrl } from "../utils/sanitization.js";
import { isEmpty, titleOf } from "../editors/hints.js";

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
  return items.length ? h("ul", {}, items.map((b) => h("li", { text: b.text }))) : null;
}

function entryRow(headline, sub, dates, extra) {
  return h(
    "div",
    { class: "pv-entry" },
    h("div", { class: "pv-entry__top" }, h("strong", { text: headline }), dates ? h("span", { class: "pv-dates", text: dates }) : null),
    sub ? h("div", { class: "pv-sub", text: sub }) : null,
    extra || null,
  );
}

function renderSection(s) {
  const body = [];
  switch (s.type) {
    case "summary":
      body.push(h("p", { class: "pv-text", text: s.text }));
      break;
    case "experience":
      s.items.forEach((e) =>
        body.push(entryRow(e.title || "Untitled position", [e.organization, e.location].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate, e.current), bulletList(e.bullets))),
      );
      break;
    case "education":
      s.items.forEach((e) =>
        body.push(
          entryRow(e.program || "Untitled program", [e.school, e.location].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate, false), e.details ? h("p", { class: "pv-text", text: e.details }) : null),
        ),
      );
      break;
    case "skills":
      s.items.forEach((e) =>
        body.push(h("p", { class: "pv-skill" }, e.label ? h("strong", { text: `${e.label}: ` }) : null, document.createTextNode(e.items.join(", ")))),
      );
      break;
    case "projects":
      s.items.forEach((e) =>
        body.push(entryRow(e.name || "Untitled project", e.role, dateRange(e.startDate, e.endDate, false), h("div", {}, e.url ? h("div", { class: "pv-sub" }, link("", e.url)) : null, bulletList(e.bullets)))),
      );
      break;
    case "certifications":
      s.items.forEach((e) =>
        body.push(entryRow(e.title || "Untitled certification", e.issuer, fmtMonth(e.date), e.url ? h("div", { class: "pv-sub" }, link("Credential", e.url)) : null)),
      );
      break;
    case "languages":
      body.push(h("p", { class: "pv-skill" }, document.createTextNode(s.items.map((e) => [e.language, e.proficiency && `(${e.proficiency})`].filter(Boolean).join(" ")).join(" · "))));
      break;
    case "custom":
      body.push(s.mode === "bullets" ? bulletList(s.bullets) : h("p", { class: "pv-text", text: s.text }));
      break;
  }
  return h("section", { class: "pv-section" }, h("h2", { text: titleOf(s) }), body);
}

/** Basic semantic preview from the canonical document. Template styling arrives in Phase 3. */
export function renderResume(doc) {
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
    { class: "pv-header" },
    h("h1", { text: c.fullName || "Your name" }),
    c.title ? h("p", { class: "pv-title", text: c.title }) : null,
    contactBits.length ? h("ul", { class: "pv-contact" }, contactBits.map((n) => h("li", {}, n))) : null,
  );

  const sections = doc.sectionOrder
    .map((id) => doc.sections[id])
    .filter((s) => s.visible && !isEmpty(s))
    .map(renderSection);

  return h("article", { class: "paper", "aria-label": "Resume preview" }, header, sections.length ? sections : h("p", { class: "pv-empty", text: "Add content on the left and it appears here." }));
}

