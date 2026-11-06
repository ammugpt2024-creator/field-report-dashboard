// What counts as an acceptable password.
//
// The rule was eight characters and nothing else, which accepts "password"
// and a person's own email address. Length does most of the work against
// guessing, so the floor is twelve, and the few patterns that get guessed
// first are refused by name rather than by a complexity rule nobody can
// satisfy without writing the password down.

export const MIN_PASSWORD_LENGTH = 12;

// Passwords that appear at the top of every breach corpus, plus the ones
// people reach for on a construction platform. Compared with digits and
// punctuation stripped, so "P@ssw0rd!" is caught with "password".
const COMMON = [
  "password", "passw0rd", "welcome", "qwerty", "qwertyui", "letmein", "iloveyou",
  "admin", "administrator", "changeme", "secret", "monkey", "dragon", "sunshine",
  "football", "baseball", "superman", "trustno", "abcabc", "abcdef", "abcdefg",
  "asdfgh", "zxcvbn", "qazwsx", "login", "master", "shadow", "freedom", "whatever",
  "starwars", "princess", "qcore", "construction", "engineering", "concrete",
  "fieldreport", "dailylog", "timesheet"
];

// Substitutions are not a secret: P@ssw0rd is "password" to anyone cracking
// it, so undo the common ones before comparing.
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "l" };
const stripNoise = (value) => String(value || "")
  .toLowerCase()
  .replace(/[0134578 9@$!|]/g, (c) => LEET[c] || "")
  .replace(/[^a-z]/g, "");

// The longest stretch that is the same character repeated, or a straight walk
// up or down the keyboard order: "aaaaaa", "123456", "fedcba". A long one
// means the password is mostly pattern, whatever its total length.
function longestRun(value) {
  const text = String(value || "").toLowerCase();
  let best = text ? 1 : 0;
  let repeat = 1;
  let up = 1;
  let down = 1;
  for (let i = 1; i < text.length; i += 1) {
    const step = text.charCodeAt(i) - text.charCodeAt(i - 1);
    repeat = step === 0 ? repeat + 1 : 1;
    up = step === 1 ? up + 1 : 1;
    down = step === -1 ? down + 1 : 1;
    best = Math.max(best, repeat, up, down);
  }
  return best;
}

/**
 * Check a password before it is set.
 * identity: { email, fullName } — a password must not simply be who you are.
 * Returns { ok, problem } where problem is shown to the person as written.
 */
export function checkPassword(password, identity = {}) {
  const value = String(password || "");

  if (value.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, problem: `Use at least ${MIN_PASSWORD_LENGTH} characters. A few words together works well and is easy to remember.` };
  }
  if (value.length > 72) {
    // Supabase hashes with bcrypt, which silently ignores anything past 72.
    return { ok: false, problem: "Use 72 characters or fewer." };
  }
  if (/^\s|\s$/.test(value)) {
    return { ok: false, problem: "Remove the space at the start or end — it is easy to lose when typing this again." };
  }
  if (longestRun(value) >= 6) {
    return { ok: false, problem: "That is mostly a repeated or sequential run, like 123456 or aaaaaa. Use something less predictable." };
  }

  const letters = stripNoise(value);
  if (COMMON.some((common) => letters.includes(common))) {
    return { ok: false, problem: "That contains a very common password. Choose something a stranger would not guess." };
  }

  const email = String(identity.email || "").toLowerCase();
  const localPart = email.split("@")[0] || "";
  if (email && letters.includes(stripNoise(email))) {
    return { ok: false, problem: "Your password cannot be your email address." };
  }
  if (localPart.length >= 4 && letters.includes(stripNoise(localPart))) {
    return { ok: false, problem: "Your password cannot contain your email name." };
  }
  for (const part of String(identity.fullName || "").split(/\s+/)) {
    const name = stripNoise(part);
    if (name.length >= 4 && letters.includes(name)) {
      return { ok: false, problem: "Your password cannot contain your own name." };
    }
  }

  return { ok: true, problem: "" };
}

// Rough strength for the meter on screen. Deliberately simple: length first,
// then variety, because that is what actually matters here.
export function passwordStrength(password, identity = {}) {
  const value = String(password || "");
  if (!value) return { score: 0, label: "" };
  if (!checkPassword(value, identity).ok) {
    return { score: value.length >= MIN_PASSWORD_LENGTH ? 1 : 0, label: value.length >= MIN_PASSWORD_LENGTH ? "Weak" : "Too short" };
  }
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  const words = value.trim().split(/\s+/).length;
  if (value.length >= 20 || (value.length >= 16 && variety >= 3) || words >= 4) return { score: 3, label: "Strong" };
  if (value.length >= 14 || variety >= 3) return { score: 2, label: "Good" };
  return { score: 1, label: "Fair" };
}
