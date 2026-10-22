import { safeUrl } from "./sanitization.js";

/** Each validator returns an error message, or "" when the value is empty or valid.
 *  Validation is advisory: content is always saved. */

export const validators = {
  email(v) {
    if (!v) return "";
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Enter an email like name@example.com.";
  },
  tel(v) {
    if (!v) return "";
    const digits = v.replace(/\D/g, "").length;
    return /^[+\d][\d\s().-]*$/.test(v.trim()) && digits >= 5 && digits <= 15
      ? ""
      : "Use digits, spaces and + ( ) - only (5 to 15 digits).";
  },
  url(v) {
    if (!v) return "";
    return safeUrl(v) ? "" : "Enter a web address such as example.com or https://example.com.";
  },
  month(v) {
    if (!v) return "";
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v.trim());
    if (!m) return "Use the format YYYY-MM, for example 2022-03.";
    const year = Number(m[1]);
    return year >= 1950 && year <= new Date().getFullYear() + 10 ? "" : "Check the year.";
  },
};

export function validateField(def, value) {
  const fn = validators[def.validate];
  return fn ? fn(typeof value === "string" ? value : "") : "";
}

/** End date before start date (both YYYY-MM). */
export function validateRange(start, end, current) {
  if (current || !start || !end) return "";
  if (validators.month(start) || validators.month(end)) return "";
  return end < start ? "The end date is before the start date." : "";
}
