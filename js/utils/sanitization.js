/** Text and URL hygiene. User text is only ever rendered with textContent;
 *  these helpers keep stored data and links safe and predictable. */

// C0/C1 control chars (except \n and \t) and bidi override/isolate characters
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

export function cleanText(value, max = 1000, { multiline = false } = {}) {
  if (typeof value !== "string") return "";
  let s = value.replace(/\r\n?/g, "\n").replace(UNSAFE, "").replace(/\t/g, " ");
  if (!multiline) s = s.replace(/\n+/g, " ");
  return s.slice(0, max);
}

/** Returns a normalised http(s) URL, or "" when the value is not a safe web link. */
export function safeUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2048 || /\s/.test(raw)) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return "";
  return url.href;
}
