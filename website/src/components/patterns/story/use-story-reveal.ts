import { type RefObject, useEffect } from "react";

const CHAPTER = '[data-slot="story-chapter"]';

/**
 * The entrances of a story deck: after hydration, marks the deck `data-animate` and each chapter `data-revealed` the
 * first time a third of it is in view, which plays its entrance (CSS transitions in `story-deck`). Chapters already
 * on screen when it starts are revealed at once, so what the server sent never disappears; without a script, under
 * reduced motion or before hydration nothing is hidden. Chapters added later (a chapter whose data arrives after
 * the rest) are picked up too. Cleans every attribute up on unmount.
 */
export function useStoryReveal(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const deck = ref.current;
    if (!enabled || !deck) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
          entry.target.dataset.revealed = "";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.35 },
    );
    const track = (chapter: HTMLElement, atStart: boolean) => {
      if ("revealed" in chapter.dataset) return;
      const rect = chapter.getBoundingClientRect();
      if (atStart && rect.bottom > 0 && rect.top < window.innerHeight) chapter.dataset.revealed = "";
      else observer.observe(chapter);
    };
    const chapters = () => [...deck.querySelectorAll<HTMLElement>(CHAPTER)];
    for (const chapter of chapters()) track(chapter, true);
    deck.dataset.animate = "";

    const mutations = new MutationObserver(() => {
      for (const chapter of chapters()) track(chapter, false);
    });
    mutations.observe(deck, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
      delete deck.dataset.animate;
      for (const chapter of chapters()) delete chapter.dataset.revealed;
    };
  }, [ref, enabled]);
}
