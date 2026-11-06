import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabase";

// Signs out after a stretch of no activity.
//
// A session used to last until someone deliberately signed out, so a site
// phone left on a truck seat, or a shared laptop in the trailer, stayed
// signed in to that company's reports indefinitely. The warning comes first:
// nobody should lose half-typed work to a silent timeout.

const MINUTE = 60 * 1000;
export const IDLE_LIMIT_MS = 30 * MINUTE;
export const IDLE_WARNING_MS = 2 * MINUTE; // shown before the limit is reached

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "visibilitychange"];

export function useIdleSignOut({ enabled, limitMs = IDLE_LIMIT_MS, warningMs = IDLE_WARNING_MS } = {}) {
  const [secondsLeft, setSecondsLeft] = useState(null); // null until the warning shows
  // Seeded inside the effect: reading the clock during render makes the
  // result depend on when React happens to re-render.
  const lastActive = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    lastActive.current = Date.now();

    const markActive = () => {
      // A tab coming back to the foreground is activity; going away is not.
      if (document.visibilityState === "hidden") return;
      lastActive.current = Date.now();
      setSecondsLeft((current) => (current === null ? current : null));
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    const tick = window.setInterval(async () => {
      const idleFor = Date.now() - lastActive.current;
      if (idleFor >= limitMs) {
        window.clearInterval(tick);
        try { await supabase.auth.signOut(); } catch { /* already gone */ }
        // Full reload so no screen keeps company data in memory.
        window.location.replace("/?signed_out=idle");
        return;
      }
      if (idleFor >= limitMs - warningMs) {
        setSecondsLeft(Math.max(0, Math.ceil((limitMs - idleFor) / 1000)));
      }
    }, 1000);

    return () => {
      window.clearInterval(tick);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
    };
  }, [enabled, limitMs, warningMs]);

  // Called by the warning's "Stay signed in" button.
  const staySignedIn = () => {
    lastActive.current = Date.now();
    setSecondsLeft(null);
  };

  return { secondsLeft, staySignedIn };
}
