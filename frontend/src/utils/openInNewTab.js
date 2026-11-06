// Opening a PDF on a phone.
//
// A signed URL has to be fetched before the file can be shown, and by the
// time that network call resolves the browser no longer counts the work as
// part of the tap. Mobile Safari and Chrome then block window.open silently:
// nothing opens, and nothing is reported. That is why View PDF did nothing on
// a phone while working on a desktop, where the blocker is lenient.
//
// The fix is to claim the tab during the tap, while the gesture still counts,
// and point it at the file once the URL is ready.

const PLACEHOLDER = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening report…</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;font:16px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#334155;background:#f8fafc">
<p>Preparing the report…</p>`;

// Call this synchronously inside the click handler, before any await.
export function reserveTab() {
  let win = null;
  try {
    // No "noopener" here: that returns null and we need the handle. The
    // opener reference is cleared below instead.
    win = window.open("", "_blank");
    if (win) {
      win.opener = null;
      win.document.write(PLACEHOLDER);
      win.document.close();
    }
  } catch {
    win = null;
  }

  return {
    // Show the file. Returns where it ended up, so callers can tell the user.
    show(url) {
      if (win && !win.closed) {
        win.location.replace(url);
        return "new-tab";
      }
      // The browser refused the tab even during the tap (some in-app browsers
      // always do). Showing it in place still gets the crew their report; the
      // back button returns them to the log.
      window.location.assign(url);
      return "same-tab";
    },
    // The file could not be produced; don't leave a blank tab behind.
    close() {
      if (win && !win.closed) {
        try { win.close(); } catch { /* already gone */ }
      }
    }
  };
}
