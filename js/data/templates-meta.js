/** Static descriptions of the eight planned templates. Rendering arrives in Phase 3. */

export const CATEGORIES = ["All", "Modern", "Creative", "Professional", "Minimal", "Executive", "Tech", "Academic"];

export const TEMPLATES = [
  {
    id: "aurora",
    name: "Aurora",
    blurb: "Expressive navy and violet presentation for design and portfolio roles.",
    categories: ["Creative", "Modern"],
    tags: [{ label: "Visually bold", tone: "warn" }],
    note: "Sidebar and graphic accents. A clean single-column print variant is planned.",
  },
  {
    id: "summit",
    name: "Summit",
    blurb: "Editorial single-column typography with refined spacing.",
    categories: ["Professional", "Minimal", "Academic"],
    tags: [{ label: "ATS-conscious", tone: "ok" }],
    note: "Single column, selectable text, standard headings.",
  },
  {
    id: "velo",
    name: "Velo",
    blurb: "Crisp technology resume with strong skills and project hierarchy.",
    categories: ["Tech", "Modern"],
    tags: [],
    note: "Two columns with a single-column fallback.",
  },
  {
    id: "slate",
    name: "Slate",
    blurb: "Dark-inspired executive identity with an ink-efficient print mode.",
    categories: ["Executive", "Professional"],
    tags: [],
    note: "Dark on screen; prints without full-page dark fills.",
  },
  {
    id: "bloom",
    name: "Bloom",
    blurb: "Warm, nature-inspired and elegant for human-centred roles.",
    categories: ["Creative"],
    tags: [{ label: "Decorative", tone: "warn" }],
    note: "Optional restrained decorative motif.",
  },
  {
    id: "grid",
    name: "Grid",
    blurb: "Strict alignment and hierarchy in black and white.",
    categories: ["Minimal", "Professional", "Academic"],
    tags: [{ label: "ATS-conscious", tone: "ok" }],
    note: "Single column with a logical reading order.",
  },
  {
    id: "vertex",
    name: "Vertex",
    blurb: "Bold editorial headings for leadership and personal-brand resumes.",
    categories: ["Creative", "Executive"],
    tags: [],
    note: "Sensible print fallback for the header block.",
  },
  {
    id: "nexus",
    name: "Nexus",
    blurb: "Modern, modular and restrained for technical and product roles.",
    categories: ["Modern", "Tech"],
    tags: [],
    note: "Modular blocks with a clear top-to-bottom order.",
  },
];
