import { supabase } from "./supabase";

// Records failures where someone can act on them.
//
// Until now a crash or a failed save existed only in the console of the
// person it happened to, so we heard about problems when a crew member
// thought to mention one. This writes them to the client_errors table, which
// a company admin can read for their own company.
//
// Rules this follows, because an error log is a place data leaks from:
//   - never the message body, a signed URL, or a token;
//   - the in-app path only, never the query string;
//   - failures here are swallowed: reporting a problem must not cause one.

const MAX_PER_SESSION = 25;      // a render loop should not write thousands of rows
const DEDUPE_WINDOW_MS = 30000;  // the same fault repeated is one entry

let sent = 0;
const recent = new Map();

const SENSITIVE = /(token|key|secret|password|signature|authorization|apikey|jwt)/i;

function scrub(value, limit = 1000) {
  let text = String(value ?? "");
  // Strip anything that looks like a credential-bearing URL or data blob.
  text = text.replace(/https?:\/\/\S+/g, (url) => (SENSITIVE.test(url) || url.includes("token=") ? "[link removed]" : url.split("?")[0]));
  text = text.replace(/data:[^\s)]+/g, "[inline data removed]");
  text = text.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token removed]");
  return text.slice(0, limit);
}

export async function reportError(error, { context = "", kind = "error" } = {}) {
  try {
    if (sent >= MAX_PER_SESSION) return;
    const message = scrub(error?.message || error || "Unknown error", 400);
    const key = `${context}|${message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_WINDOW_MS) return;
    recent.set(key, now);

    // Only report for a signed-in person: an anonymous row has no company and
    // nobody to show it to.
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user?.id) return;

    sent += 1;
    await supabase.from("client_errors").insert({
      user_id: auth.user.id,
      kind,
      message,
      context: scrub(context, 120),
      stack: scrub(error?.stack || "", 2000),
      path: window.location.pathname,
      user_agent: String(navigator.userAgent || "").slice(0, 300)
    });
  } catch {
    // A failure to record a failure is not worth a second failure.
  }
}

// Catches what no try/catch did: a render crash, or a promise nobody awaited.
export function installGlobalErrorReporting() {
  if (typeof window === "undefined" || window.__qcoreErrorReporting) return;
  window.__qcoreErrorReporting = true;

  window.addEventListener("error", (event) => {
    reportError(event.error || event.message, { context: "window.error" });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportError(reason instanceof Error ? reason : new Error(String(reason)), {
      context: "unhandled promise",
      kind: "unhandled_rejection"
    });
  });
}
