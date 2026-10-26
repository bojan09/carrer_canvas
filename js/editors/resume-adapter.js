import { SECTION_DEFS } from "../models/section-defs.js";
import { createSample } from "../models/resume.js";
import { confirmDialog } from "../components/dialog.js";
import { analyze, openIssues, titleOf } from "./hints.js";
import { checkboxField } from "./fields.js";
import { contactBody, sectionBody } from "./section-forms.js";

/** What the editing studio needs to know about a resume: its accordion cards, checklist and sample.
 *  (js/editors/letter-adapter.js is the cover-letter counterpart.) */

function sectionMeta(section) {
  if (!section.visible) return "Hidden";
  if (section.items) return `${section.items.length} ${section.items.length === 1 ? "entry" : "entries"}`;
  return "";
}

let sampleDoc = null;

export const resumeAdapter = {
  kind: "resume",
  noun: "resume",
  untitled: "Untitled resume",
  hasRail: true,
  analyze,
  openIssues,
  sample: () => (sampleDoc ||= createSample()),

  /** @returns {{id:string,label:string,iconName:string,meta?:string,hidden?:boolean,fill:(body:HTMLElement)=>void}[]} */
  cards(session, ctx) {
    const doc = session.doc;
    const cards = [{ id: "contact", label: "Personal Info", iconName: "user", fill: (body) => body.append(contactBody(doc, ctx)) }];
    for (const id of doc.sectionOrder) {
      const section = doc.sections[id];
      cards.push({
        id,
        label: titleOf(section),
        iconName: SECTION_DEFS[section.type].icon,
        meta: sectionMeta(section),
        hidden: !section.visible,
        fill(body) {
          const tools = checkboxToolbar(section, id, session, ctx);
          body.append(tools, sectionBody(section, ctx));
        },
      });
    }
    return cards;
  },
};

function checkboxToolbar(section, id, session, ctx) {
  const tools = document.createElement("div");
  tools.className = "sec__tools";
  const vis = checkboxField({
    label: "Show this section on my resume",
    checked: section.visible,
    onChange: (v) => ctx.change(() => (section.visible = v), { structural: true, focusKey: `sec:${id}` }),
  });
  tools.append(vis.root);
  if (section.type === "custom") {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn--ghost btn--sm btn--danger-text";
    del.textContent = "Delete section";
    del.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: `Delete “${titleOf(section)}”?`, message: "This section and its content will be removed. You can bring it back with Undo.", confirmLabel: "Delete", danger: true });
      if (!ok) return;
      ctx.change(
        () => {
          delete session.doc.sections[id];
          session.doc.sectionOrder = session.doc.sectionOrder.filter((x) => x !== id);
        },
        { structural: true, focusKey: "rail:add" },
      );
      ctx.undoable("Section deleted.");
    });
    tools.append(del);
  }
  return tools;
}
