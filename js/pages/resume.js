import { renderPlaceholder } from "../components/placeholder.js";

export default function resume(root) {
  renderPlaceholder(root, {
    iconName: "file-text",
    title: "Resume",
    lead: "The editor studio: sections, live preview and design controls in one place.",
    phase: "Phase 2: not built yet",
    headline: "The resume editor is coming next",
    studio: true,
    actions: [
      { href: "#/templates", label: "Browse templates", variant: "primary" },
      { href: "#/", label: "Back to Home" },
    ],
  });
}
