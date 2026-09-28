import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copies text and reports the outcome for `resetAfter` milliseconds, so a control can confirm the copy (`copied`) or
 * say it did not work (`failed`: no clipboard access). `copy` resolves to whether the clipboard accepted the text; it
 * never throws.
 */
export function useCopyToClipboard(resetAfter = 2000) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = useCallback(
    async (text: string) => {
      clearTimeout(resetTimer.current);
      setStatus("idle");
      let ok = true;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        ok = false;
      }
      setStatus(ok ? "copied" : "failed");
      resetTimer.current = setTimeout(() => setStatus("idle"), resetAfter);
      return ok;
    },
    [resetAfter],
  );

  return { copied: status === "copied", failed: status === "failed", copy };
}
