import { useEffect, useRef, useState } from "react";

import { type AnswerOptionState, revealedState } from "~/components/domain/minigames/AnswerOption";

import { useAnswerKeys } from "./use-answer-keys";
import { useFlashcardProgress } from "./use-flashcard-progress";
import { useNextCardFocus } from "./use-next-card-focus";

export interface FlashcardCard<Entry, Option> {
  answer: Entry;
  options: Option[];
}

type OptionKey = string | number;

interface Deal<Entry, Option> {
  card: FlashcardCard<Entry, Option> | null;
  /** The key of the option picked, while its verdict shows. */
  selected: OptionKey | null;
  /** Counts deals, so a reveal timer set for one card never advances another. */
  serial: number;
  /** The `reshuffleKey` the card was dealt for; null before the first deal. */
  dealtFor: string | null;
}

export interface FlashcardDeckOptions<Entry extends { id: number }, Option> {
  pool: Entry[];
  /** Names the deck's saved settings and progress (`flashcards:<deck>:*` in storage). */
  deck: string;
  /** Deals a card whose answer is not in `excludeIds`, or null when every entry is excluded. */
  draw: (pool: Entry[], excludeIds: Set<number>) => FlashcardCard<Entry, Option> | null;
  optionKey: (option: Option) => OptionKey;
  /** The key of the option that answers `answer`. */
  answerKey: (answer: Entry) => OptionKey;
  /** How long a verdict shows before the next card, in ms. */
  feedbackMs?: { correct: number; wrong: number };
  /** Changing this value draws a fresh card (stats and progress are kept). */
  reshuffleKey?: string;
}

const DEFAULT_FEEDBACK_MS = { correct: 500, wrong: 1500 };

/**
 * The behaviour of a flashcard deck, without its look: dealing cards (no repeats, or not the card just seen), picking
 * an answer by click or number key, the verdict's pause before the next card, keyboard focus moving to the new card,
 * and the saved stats and mastered cards.
 */
export function useFlashcardDeck<Entry extends { id: number }, Option>({
  pool,
  deck,
  draw,
  optionKey,
  answerKey,
  feedbackMs = DEFAULT_FEEDBACK_MS,
  reshuffleKey = "",
}: FlashcardDeckOptions<Entry, Option>) {
  const { noRepeats, setNoRepeats, stats, seenIds, recordAnswer, resetProgress, loaded } = useFlashcardProgress(deck);
  const [deal, setDeal] = useState<Deal<Entry, Option>>({ card: null, selected: null, serial: 0, dealtFor: null });
  const { card, selected } = deal;
  const advanceTimer = useRef<number | null>(null);
  const { markAnswered, focusFirstOption } = useNextCardFocus();

  /** Not the card just seen, unless it is the only one; with "No repeats" none already mastered. */
  const excludeAfter = (current: FlashcardCard<Entry, Option> | null, mastered: Set<number>) =>
    noRepeats ? mastered : new Set<number>(current && pool.length > 1 ? [current.answer.id] : []);

  // The first card waits for the saved progress, so "No repeats" never opens on a card already mastered. A new
  // reshuffle key deals again, derived here rather than in an Effect: a reveal pending for the old card is dropped by
  // its serial.
  if (loaded && deal.dealtFor !== reshuffleKey) {
    setDeal({
      card: draw(pool, excludeAfter(card, seenIds)),
      selected: null,
      serial: deal.serial + 1,
      dealtFor: reshuffleKey,
    });
  }

  const clearAdvanceTimer = () => {
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };
  useEffect(
    () => () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    },
    [],
  );

  const dealFresh = (next: FlashcardCard<Entry, Option> | null) =>
    setDeal((d) => ({ ...d, card: next, selected: null, serial: d.serial + 1 }));

  const choose = (option: Option) => {
    if (!card || selected !== null) return;
    const key = optionKey(option);
    const correct = key === answerKey(card.answer);
    const serial = deal.serial;
    setDeal((d) => ({ ...d, selected: key }));
    markAnswered();
    const nextSeen = recordAnswer(card.answer.id, correct);
    const exclude = excludeAfter(card, nextSeen);
    advanceTimer.current = window.setTimeout(
      () => {
        // Drawn here, not in the updater: an updater must be pure (StrictMode runs it twice).
        const next = draw(pool, exclude);
        setDeal((d) => (d.serial === serial ? { ...d, card: next, selected: null, serial: serial + 1 } : d));
      },
      correct ? feedbackMs.correct : feedbackMs.wrong,
    );
  };

  useAnswerKeys(
    card?.options.length ?? 0,
    (index) => {
      const option = card?.options[index];
      if (option !== undefined) choose(option);
    },
    selected === null,
  );

  const updateNoRepeats = (value: boolean) => {
    setNoRepeats(value);
    // Allowing repeats again after the pool was mastered: deal a card rather than stay on "mastered".
    if (!value && card === null && pool.length > 0) dealFresh(draw(pool, new Set()));
  };

  const reset = () => {
    clearAdvanceTimer();
    resetProgress();
    dealFresh(draw(pool, new Set()));
  };

  const empty = pool.length === 0;
  // A filter or a patch can shrink the pool below cards already mastered; only the ones still in it count.
  const masteredInPool = pool.reduce((count, entry) => count + Number(seenIds.has(entry.id)), 0);
  // The last card keeps its verdict on screen before "mastered" replaces it.
  const exhausted = noRepeats && pool.length > 0 && masteredInPool >= pool.length && selected === null;
  const verdict: "correct" | "wrong" | null =
    card === null || selected === null ? null : selected === answerKey(card.answer) ? "correct" : "wrong";

  const stateOf = (option: Option): AnswerOptionState => {
    if (card === null || selected === null) return "idle";
    const key = optionKey(option);
    return revealedState(key === answerKey(card.answer), key === selected);
  };

  return {
    /** False until the saved progress loaded and the first card is dealt. */
    dealt: deal.dealtFor !== null,
    card,
    verdict,
    /** True while the verdict of a pick shows. */
    revealed: selected !== null,
    stateOf,
    choose,
    focusFirstOption,
    noRepeats,
    setNoRepeats: updateNoRepeats,
    stats,
    reset,
    masteredInPool,
    empty,
    /** Every card mastered with "No repeats" on, or nothing left to deal. */
    finished: exhausted || card === null,
  };
}

export type FlashcardDeck<Entry extends { id: number }, Option> = ReturnType<typeof useFlashcardDeck<Entry, Option>>;
