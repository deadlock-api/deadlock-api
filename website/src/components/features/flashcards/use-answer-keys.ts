import { useEffect } from "react";

import { isTyping } from "~/lib/keyboard";

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
