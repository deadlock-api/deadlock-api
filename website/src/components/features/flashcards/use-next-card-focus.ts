import { useCallback, useRef } from "react";

/**
 * Keeps a deck playable with the keyboard alone. During the reveal the options stay focusable (`aria-disabled`), so
 * focus stays on the answer just picked; when the next card replaces them focus would fall to <body>, and the new
 * card's first option takes it instead. Nothing moves before the first answer, or when focus is elsewhere on the page.
 */
export function useNextCardFocus() {
  const answered = useRef(false);
  const markAnswered = useCallback(() => {
    answered.current = true;
  }, []);
  const focusFirstOption = useCallback((element: HTMLButtonElement | null) => {
    if (element && answered.current && (document.activeElement === document.body || document.activeElement === null)) {
      element.focus();
    }
  }, []);
  return { markAnswered, focusFirstOption };
}
