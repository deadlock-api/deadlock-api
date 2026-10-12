import { getAnalytics } from "~/lib/analytics";

// Flashcards' product analytics (PostHog, through the site's `getAnalytics`: production only, cookieless). Every event
// is `flashcards_<name>` and carries the deck. A session's first answer to a deck is `deck_started`, so started decks
// count once per page load rather than once per card.

type Properties = Record<string, string | number | boolean>;

const started = new Set<string>();

export function trackFlashcards(
  name: "deck_started" | "card_answered" | "deck_mastered" | "progress_reset" | "no_repeats_toggled",
  deck: string,
  properties: Properties = {},
) {
  void getAnalytics().then((posthog) => posthog?.capture(`flashcards_${name}`, { deck, ...properties }));
}

/** One answer: `deck_started` with the first of this page load, then `card_answered`. */
export function trackFlashcardAnswer(deck: string, properties: Properties) {
  if (!started.has(deck)) {
    started.add(deck);
    trackFlashcards("deck_started", deck, { no_repeats: properties.no_repeats ?? false });
  }
  trackFlashcards("card_answered", deck, properties);
}
