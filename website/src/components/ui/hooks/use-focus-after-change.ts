import { useEffect, useRef } from "react";

/**
 * Keeps keyboard focus on the page when a change removes the element that held it (adding or removing an item of a
 * list, an empty state giving way to its content). Put `ref` on an element around everything involved, and call
 * `focusAfterChange(selectors)` just before the change. Once `version` (a value the change alters, such as the items'
 * ids joined) is different, focus stays where it was if that element is still on the page, else it moves to the first
 * selector that matches inside `ref`: by convention the next item, then the previous one, then a fallback such as the
 * control that adds an item. Without a match focus is left alone.
 */
export function useFocusAfterChange<T extends HTMLElement = HTMLDivElement>(version: string | number) {
  const ref = useRef<T>(null);
  const pending = useRef<{ version: string | number; from: Element | null; selectors: readonly string[] } | null>(null);

  // After every render, so it sees the one that carries the change, however many renders the change takes.
  useEffect(() => {
    const request = pending.current;
    if (!request || request.version === version) return;
    pending.current = null;
    if (request.from?.isConnected && document.activeElement === request.from) return;
    for (const selector of request.selectors) {
      const element = ref.current?.querySelector<HTMLElement>(selector);
      if (element) {
        element.focus();
        return;
      }
    }
  });

  const focusAfterChange = (selectors: readonly string[]) => {
    pending.current = { version, from: document.activeElement, selectors };
  };
  return { ref, focusAfterChange };
}
