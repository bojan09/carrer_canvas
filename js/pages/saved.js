import { renderPlaceholder } from "../components/placeholder.js";

export default function saved(root) {
  renderPlaceholder(root, {
    iconName: "folder",
    title: "Saved documents",
    lead: "Your resumes and cover letters, stored only on this device.",
    phase: "Phase 2: not built yet",
    headline: "No documents yet",
    actions: [
      { href: "#/resume", label: "Go to Resume", variant: "primary" },
      { href: "#/settings", label: "Privacy & storage" },
    ],
  });
}
