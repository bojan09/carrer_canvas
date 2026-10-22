/** Declarative description of every section. Forms, validation, normalisation,
 *  the preview and the writing checklist are all driven from this one table. */

export const SECTION_DEFS = {
  summary: {
    label: "Professional Summary",
    icon: "file-text",
    kind: "text",
    max: 2000,
    hint: "Two to four sentences: who you are, what you do best and what you want next. Stick to facts you can support.",
  },
  experience: {
    label: "Work Experience",
    icon: "briefcase",
    kind: "entries",
    itemLabel: "position",
    hint: "Describe what you did, how you did it and what changed. Use consistent tense and only results you can stand behind.",
    summary: (e) => [e.title, e.organization].filter(Boolean).join(" · "),
    fields: [
      { key: "title", label: "Job title", max: 120, autocomplete: "organization-title" },
      { key: "organization", label: "Company", max: 120, autocomplete: "organization" },
      { key: "location", label: "Location", max: 120 },
      { key: "startDate", label: "Start date", type: "month", validate: "month", placeholder: "YYYY-MM", max: 10 },
      { key: "endDate", label: "End date", type: "month", validate: "month", placeholder: "YYYY-MM", max: 10, disabledWhen: "current" },
      { key: "current", label: "I currently work here", type: "checkbox" },
      {
        key: "bullets",
        label: "Achievements and responsibilities",
        type: "bullets",
        max: 400,
        hint: "Start with an action verb, add the method, then the impact. Example shape: “Reduced report turnaround by redesigning the review process.” Add numbers only if they are real.",
      },
    ],
  },
  education: {
    label: "Education",
    icon: "graduation",
    kind: "entries",
    itemLabel: "education entry",
    hint: "List your most relevant qualifications first. Details are optional.",
    summary: (e) => [e.program, e.school].filter(Boolean).join(" · "),
    fields: [
      { key: "program", label: "Degree or program", max: 160 },
      { key: "school", label: "School", max: 160, autocomplete: "organization" },
      { key: "location", label: "Location", max: 120 },
      { key: "startDate", label: "Start date", type: "month", validate: "month", placeholder: "YYYY-MM", max: 10 },
      { key: "endDate", label: "End date", type: "month", validate: "month", placeholder: "YYYY-MM", max: 10 },
      { key: "details", label: "Details", type: "textarea", max: 600, hint: "Honours, relevant coursework or thesis, if useful for the role.", full: true },
    ],
  },
  skills: {
    label: "Skills",
    icon: "star",
    kind: "entries",
    itemLabel: "skill group",
    hint: "Group skills so they are quick to scan. List skills you can discuss in an interview. Rating bars are intentionally not offered.",
    summary: (e) => e.label || (e.items || []).slice(0, 3).join(", "),
    fields: [
      { key: "label", label: "Group name (optional)", max: 80, placeholder: "e.g. Tools" },
      { key: "items", label: "Skills", type: "tags", max: 600, full: true, hint: "Separate skills with commas." },
    ],
  },
  projects: {
    label: "Projects",
    icon: "layers",
    kind: "entries",
    itemLabel: "project",
    hint: "Choose projects that show skills relevant to the role. Link to work that is public.",
    summary: (e) => [e.name, e.role].filter(Boolean).join(" · "),
    fields: [
      { key: "name", label: "Project name", max: 120 },
      { key: "role", label: "Your role", max: 120 },
      { key: "startDate", label: "Start date", type: "month", validate: "month", placeholder: "YYYY-MM", max: 10 },
      { key: "endDate", label: "End date", type: "month", validate: "month", placeholder: "YYYY-MM", max: 10 },
      { key: "url", label: "Link", type: "url", validate: "url", max: 300, autocomplete: "url", full: true },
      { key: "bullets", label: "Outcomes", type: "bullets", max: 400, hint: "What did you build or change, and what was the result?" },
    ],
  },
  certifications: {
    label: "Certifications",
    icon: "award",
    kind: "entries",
    itemLabel: "certification",
    hint: "Only list certifications you currently hold or are actively pursuing, and say which.",
    summary: (e) => [e.title, e.issuer].filter(Boolean).join(" · "),
    fields: [
      { key: "title", label: "Certification", max: 160 },
      { key: "issuer", label: "Issuer", max: 120 },
      { key: "date", label: "Issue date", type: "month", validate: "month", placeholder: "YYYY-MM", max: 10 },
      { key: "url", label: "Credential link (optional)", type: "url", validate: "url", max: 300 },
    ],
  },
  languages: {
    label: "Languages",
    icon: "globe",
    kind: "entries",
    itemLabel: "language",
    hint: "Proficiency is your own description, for example Native, Fluent or Conversational.",
    summary: (e) => [e.language, e.proficiency].filter(Boolean).join(" · "),
    fields: [
      { key: "language", label: "Language", max: 60 },
      { key: "proficiency", label: "Proficiency", max: 60, list: ["Native", "Fluent", "Advanced", "Intermediate", "Conversational", "Basic"] },
    ],
  },
  custom: {
    label: "Custom section",
    icon: "type",
    kind: "custom",
    hint: "Add anything else that supports your application, such as volunteering or publications.",
  },
};

export const BUILTIN_ORDER = ["summary", "experience", "education", "skills", "projects", "certifications", "languages"];

/** Fields shown in Personal Info (not a reorderable section). */
export const CONTACT_FIELDS = [
  { key: "fullName", label: "Full name", max: 100, autocomplete: "name" },
  { key: "title", label: "Professional title", max: 120, autocomplete: "organization-title" },
  { key: "email", label: "Email", type: "email", validate: "email", max: 160, autocomplete: "email", inputmode: "email" },
  { key: "phone", label: "Phone", type: "tel", validate: "tel", max: 40, autocomplete: "tel", inputmode: "tel" },
  { key: "location", label: "Location", max: 120, autocomplete: "address-level2", hint: "City and region are enough. Skip your street address." },
  { key: "website", label: "Website or portfolio", type: "url", validate: "url", max: 300, autocomplete: "url" },
  { key: "linkedin", label: "LinkedIn", type: "url", validate: "url", max: 300 },
];
