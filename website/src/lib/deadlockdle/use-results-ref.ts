import { type RefCallback, type RefObject, useCallback } from "react";

/**
 * A ref for a round's results block: once it mounts it scrolls into view (smoothly unless the player prefers reduced
 * motion), and takes focus when `takeFocus` is set, i.e. when it replaced the control the player just used, so focus
 * does not fall back to <body>. A finished day reopened scrolls to the results without moving focus.
 */
export function useResultsRef<T extends HTMLElement>(takeFocus: RefObject<boolean>): RefCallback<T> {
  return useCallback(
    (node: T | null) => {
      if (!node) return;
      if (takeFocus.current) node.focus({ preventScroll: true });
      const timer = setTimeout(() => {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        node.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
      }, 150);
      return () => clearTimeout(timer);
    },
    [takeFocus],
  );
}
