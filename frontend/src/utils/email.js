// One place that decides whether an address looks like an address.
//
// This check was written out by hand in several screens, and one copy lost a
// backslash: [^@s] instead of [^@\s], which excludes the letter "s" rather
// than whitespace. Every address with an s in the domain was refused --
// dullesengineers.com among them -- and the message blamed the person typing.

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

export function isValidEmail(value) {
  return EMAIL.test(String(value || "").trim());
}

// Normalised for storage and comparison: trimmed and lower-cased.
export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

// "a@b.com, c@d.com" or newline/semicolon separated -> ["a@b.com", "c@d.com"]
export function parseEmailList(value) {
  return [...new Set(
    String(value || "")
      .split(/[,;\s]+/)
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean)
  )];
}
