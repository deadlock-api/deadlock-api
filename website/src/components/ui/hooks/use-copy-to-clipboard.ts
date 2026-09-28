import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copies text, or an image, and reports `copied` for `resetAfter` milliseconds, so a control can confirm the copy.
 * `copy` resolves to whether the clipboard accepted it; it never throws. An image is a PNG blob, or the promise of
 * one: call `copy` straight from the click with the pending download, since Safari only allows a clipboard write
 * that starts inside the user's gesture.
 */
export function useCopyToClipboard(resetAfter = 2000) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = useCallback(
    async (content: string | Blob | Promise<Blob>) => {
      clearTimeout(resetTimer.current);
      setCopied(false);
      try {
        if (typeof content === "string") await navigator.clipboard.writeText(content);
        else await navigator.clipboard.write([new ClipboardItem({ "image/png": content })]);
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
