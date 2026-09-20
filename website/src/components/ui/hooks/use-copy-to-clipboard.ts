import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copies text and reports `copied` for `resetAfter` milliseconds, so a control can confirm the copy. `copy` resolves
 * to whether the clipboard accepted the text; it never throws.
 */
export function useCopyToClipboard(resetAfter = 2000) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = useCallback(
    async (text: string) => {
      clearTimeout(resetTimer.current);
      setCopied(false);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      setCopied(true);
      resetTimer.current = setTimeout(() => setCopied(false), resetAfter);
      return true;
    },
    [resetAfter],
  );

  return { copied, copy };
}
