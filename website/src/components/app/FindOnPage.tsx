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
 * types or scrolls the wheel. A page that renders the element again (hydration, fresh data) gets the outline moved to
 * the new one; with several copies, the first visible one is outlined.
 */
export function FindOnPage() {
  const hash = useLocation({ select: (location) => location.hash });

  useEffect(() => {
    if (!hash.startsWith("find:")) return undefined;
    const selector = `[data-find="${CSS.escape(hash.slice("find:".length))}"]`;
    let found: Element | null = null;
    let scrolled = false;
    let done = false;

    const visible = () => [...document.querySelectorAll(selector)].find((element) => element.checkVisibility());

    const mark = () => {
      if (done || found?.isConnected) return;
      found = visible() ?? null;
      if (!found) return;
      found.setAttribute("data-found", "");
      if (!scrolled) {
        scrolled = true;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        found.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        for (const type of DISMISS_EVENTS) window.addEventListener(type, finish, { once: true, passive: true });
        stop = window.setTimeout(finish, OUTLINE_MS);
      }
    };

    // Watches until the outline is dismissed: the element may render late, or be rendered again without the mark.
    const observer = new MutationObserver(mark);
    let stop = window.setTimeout(() => !scrolled && finish(), WAIT_MS);

    function finish() {
      done = true;
      observer.disconnect();
      window.clearTimeout(stop);
      for (const type of DISMISS_EVENTS) window.removeEventListener(type, finish);
      found?.removeAttribute("data-found");
    }

    observer.observe(document.body, { childList: true, subtree: true });
    mark();
    return finish;
  }, [hash]);

  return null;
}
