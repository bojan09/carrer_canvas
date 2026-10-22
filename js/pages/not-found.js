import { renderPlaceholder } from "../components/placeholder.js";

export default function notFound(root) {
  renderPlaceholder(root, {
    iconName: "info",
    title: "Page not found",
    lead: "That address does not match any page in CareerCanvas.",
    phase: "404",
    headline: "Nothing here",
    actions: [{ href: "#/", label: "Back to Home", variant: "primary" }],
  });
}
