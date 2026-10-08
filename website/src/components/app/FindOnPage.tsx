import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

/** How long to wait for the element to render (its data may still be loading), and how long it stays outlined. */
const WAIT_MS = 15_000;
const OUTLINE_MS = 4_000;

/**
 * Takes a visitor to what they asked for: on a `#find:<key>` URL (the AI search adds it), scrolls to the element
 * marked `data-find="<key>"` once it renders and outlines it for a few seconds (`[data-found]` in effects.css).
 */
export function FindOnPage() {
  const hash = useLocation({ select: (location) => location.hash });

  useEffect(() => {
    if (!hash.startsWith("find:")) return undefined;
    const selector = `[data-find="${CSS.escape(hash.slice("find:".length))}"]`;
    let found: Element | null = null;
    let unmark: number | undefined;

    const mark = () => {
      found = document.querySelector(selector);
      if (!found) return false;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      found.setAttribute("data-found", "");
      found.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      unmark = window.setTimeout(() => found?.removeAttribute("data-found"), OUTLINE_MS);
      return true;
    };

    const observer = new MutationObserver(() => {
      if (mark()) observer.disconnect();
    });
    if (!mark()) observer.observe(document.body, { childList: true, subtree: true });
    const giveUp = window.setTimeout(() => observer.disconnect(), WAIT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(giveUp);
      window.clearTimeout(unmark);
      found?.removeAttribute("data-found");
    };
  }, [hash]);

  return null;
}
