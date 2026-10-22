import { renderPlaceholder } from "../components/placeholder.js";

export default function coverLetter(root) {
  renderPlaceholder(root, {
    iconName: "mail",
    title: "Cover Letter",
    lead: "Letters that visually match your resume, written and saved on your device.",
    phase: "Phase 5: not built yet",
    headline: "The cover letter builder comes after the resume core",
    actions: [
      { href: "#/resume", label: "Go to Resume", variant: "primary" },
      { href: "#/", label: "Back to Home" },
    ],
  });
}
