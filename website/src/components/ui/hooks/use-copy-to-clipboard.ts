import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Writes `text` to the clipboard. Text still on its way goes in a `ClipboardItem`, which keeps the press's permission
 * to write while it resolves; a browser without one gets the text once it is there, while the press may still allow
 * the write.
 */
async function writeClipboard(text: string | Promise<string>): Promise<void> {
  if (typeof text === "string") return navigator.clipboard.writeText(text);
  if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
    try {
      const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return;
    } catch {
      // A browser that does not take a pending item; the text itself failing fails again below.
    }
  }
  await navigator.clipboard.writeText(await text);
}

/**
 * Copies text and reports the outcome for `resetAfter` milliseconds, so a control can confirm the copy (`copied`) or
 * say it did not work (`failed`: no clipboard access, or text that could not be made). `copying` is true while text
 * passed as a promise is still on its way. `copy` resolves to whether the clipboard accepted the text; it never throws.
 */
export function useCopyToClipboard(resetAfter = 2000) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = useCallback(
    async (text: string | Promise<string>) => {
      clearTimeout(resetTimer.current);
      setStatus(typeof text === "string" ? "idle" : "copying");
      let ok = true;
      try {
        await writeClipboard(text);
      } catch {
        ok = false;
      }
      setStatus(ok ? "copied" : "failed");
      resetTimer.current = setTimeout(() => setStatus("idle"), resetAfter);
      return ok;
    },
    [resetAfter],
  );

  return { copying: status === "copying", copied: status === "copied", failed: status === "failed", copy };
}
