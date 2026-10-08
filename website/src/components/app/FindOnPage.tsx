import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

/** How long to wait for the element to render (its data may still be loading). */
const WAIT_MS = 15_000;
/** The outline stays until the visitor does something on the page, or at most this long. */
const OUTLINE_MS = 12_000;
/** What counts as doing something; scrolling does not, since the page scrolls itself to the element. */
const DISMISS_EVENTS = ["pointerdown", "keydown", "wheel"] as const;

/**
 * Takes a visitor to what they asked for: on a `#find:<key>` URL (the AI search adds it), scrolls to the element
 * marked `data-find="<key>"` once it renders and outlines it (`[data-found]` in effects.css) until the visitor clicks,
 * types or scrolls the wheel.
 */
export function FindOnPage() {
  const hash = useLocation({ select: (location) => location.hash });

  useEffect(() => {
    if (!hash.startsWith("find:")) return undefined;
    const selector = `[data-find="${CSS.escape(hash.slice("find:".length))}"]`;
    let found: Element | null = null;
    let unmark: number | undefined;
    const dismiss = () => {
      found?.removeAttribute("data-found");
      for (const type of DISMISS_EVENTS) window.removeEventListener(type, dismiss);
    };

    const mark = () => {
      found = document.querySelector(selector);
      if (!found) return false;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      found.setAttribute("data-found", "");
      found.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      unmark = window.setTimeout(dismiss, OUTLINE_MS);
      for (const type of DISMISS_EVENTS) window.addEventListener(type, dismiss, { once: true, passive: true });
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
      dismiss();
    };
  }, [hash]);

  return null;
}
