import { useEffect, useState } from "react";

const ACTIVITY = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * True once the visitor has not touched the page (pointer, keys, wheel, touch, scroll) for `ms` while it is visible,
 * false again at their next input. Always false while `enabled` is false.
 */
export function useIdle(ms: number, enabled = true): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const onActivity = () => {
      last = Date.now();
      setIdle(false);
    };
    const check = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= ms) setIdle(true);
    };
    // A hidden tab does not count as idle time: coming back starts the wait anew.
    const onVisibility = () => {
      if (document.visibilityState === "visible") onActivity();
    };
    for (const type of ACTIVITY) window.addEventListener(type, onActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(check, 1000);
    return () => {
      for (const type of ACTIVITY) window.removeEventListener(type, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
      setIdle(false);
    };
  }, [ms, enabled]);

  return idle;
}
