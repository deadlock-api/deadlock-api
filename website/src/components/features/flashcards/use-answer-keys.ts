import { useEffect } from "react";

/** Whether a key press belongs to a text field, where digits are typed rather than used as shortcuts. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Number keys pick an answer: 1 is the first option, 2 the second, and so on. Off while `enabled` is false (an answer
 * is being revealed), and never while typing in a field or with a modifier held.
 */
export function useAnswerKeys(count: number, onPick: (index: number) => void, enabled = true) {
  useEffect(() => {
    if (!enabled || count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= count) return;
      event.preventDefault();
      onPick(index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, enabled, onPick]);
}
