/** Polite screen-reader announcements via the shared live region. */
export function announce(message) {
  const region = document.getElementById("route-announcer");
  if (!region) return;
  region.textContent = "";
  setTimeout(() => (region.textContent = message), 30);
}
