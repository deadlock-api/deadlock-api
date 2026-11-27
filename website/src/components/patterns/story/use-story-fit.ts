import { type RefObject, useEffect } from "react";

const CHAPTER = '[data-slot="story-chapter"]';
/** Below this a card would be too small to read: it grows past the screen instead. */
const MIN_FIT = 0.65;
/** Cards on narrow screens always grow: there is no room to shrink into. */
const WIDE = "(width >= 48rem)";
/** Room kept free for rounding (zoomed borders, line boxes), so nothing is clipped by a pixel or two. */
const SAFETY_PX = 20;

/**
 * Keeps every card of a story deck free of an inner scrollbar. A card whose content is taller than the card is scaled
 * down to fit (`--story-fit` on the card, read by `story-deck` as the `zoom` of its blocks), down to 65%; past that,
 * or on a narrow screen, it is marked `data-fit="grow"` and grows past the screen, so the page scrolls through it.
 * Measures again whenever a card or its content changes size. Before it runs (server HTML) cards grow as needed.
 */
export function useStoryFit(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const deck = ref.current;
    if (!enabled || !deck) return;
    const wide = window.matchMedia(WIDE);
    const pending = new Set<HTMLElement>();
    let frame = 0;

    const fit = (chapter: HTMLElement) => {
      if (!wide.matches) {
        chapter.dataset.fit = "grow";
        chapter.style.removeProperty("--story-fit");
        return;
      }
      const blocks = [...chapter.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.getAttribute("aria-hidden") !== "true",
      );
      const current = Number.parseFloat(chapter.style.getPropertyValue("--story-fit")) || 1;
      const style = getComputedStyle(chapter);
      const fixed =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        (Number.parseFloat(style.rowGap) || 0) * Math.max(blocks.length - 1, 0);
      const natural = blocks.reduce((sum, block) => sum + block.getBoundingClientRect().height / current, 0);
      // The height a fixed card has (a grown one is taller): what its content must fit into.
      const room = Number.parseFloat(style.minHeight) || window.innerHeight;
      const scale = natural > 0 ? Math.min(1, (room - fixed - SAFETY_PX) / natural) : 1;
      if (scale < MIN_FIT) {
        chapter.dataset.fit = "grow";
        chapter.style.removeProperty("--story-fit");
      } else {
        chapter.dataset.fit = "fixed";
        if (Math.abs(scale - current) > 0.005) chapter.style.setProperty("--story-fit", scale.toFixed(3));
      }
    };
    const flush = () => {
      frame = 0;
      for (const chapter of pending) fit(chapter);
      pending.clear();
    };
    const schedule = (chapter: HTMLElement) => {
      pending.add(chapter);
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const resizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const chapter = entry.target.closest<HTMLElement>(CHAPTER);
        if (chapter) schedule(chapter);
      }
    });
    const watched = new WeakSet<Element>();
    const watch = () => {
      for (const chapter of deck.querySelectorAll<HTMLElement>(CHAPTER)) {
        for (const element of [chapter, ...chapter.children]) {
          if (watched.has(element)) continue;
          watched.add(element);
          resizes.observe(element);
        }
        schedule(chapter);
      }
    };
    watch();
    const mutations = new MutationObserver(watch);
    mutations.observe(deck, { childList: true, subtree: true });
    const onWidth = () => {
      for (const chapter of deck.querySelectorAll<HTMLElement>(CHAPTER)) schedule(chapter);
    };
    wide.addEventListener("change", onWidth);

    return () => {
      wide.removeEventListener("change", onWidth);
      mutations.disconnect();
      resizes.disconnect();
      cancelAnimationFrame(frame);
      for (const chapter of deck.querySelectorAll<HTMLElement>(CHAPTER)) {
        delete chapter.dataset.fit;
        chapter.style.removeProperty("--story-fit");
      }
    };
  }, [ref, enabled]);
}
