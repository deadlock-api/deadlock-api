import { useMemo, useState } from "react";

import type { Hint } from "~/lib/deadlockdle/hints";
import { getModeSeed, seededPick, seededRandom } from "~/lib/deadlockdle/seed";
import type { GameMode } from "~/lib/deadlockdle/types";
import { useDailyGame } from "~/lib/deadlockdle/use-daily-game";

import { wrongGuessMessage } from "./GuessFeedback";
import { useGuessFeedback } from "./use-guess-feedback";

/**
 * A daily "name the thing" round (a hero, an item, an ability): today's answer drawn from `pool` by the mode's seed,
 * the guesses left to offer (each name once, none already guessed), the guess itself with its feedback and shake, and
 * the hint the feedback names after a wrong one. The saved game and streak are `useDailyGame`'s.
 */
export function useDailyGuess<T extends { id: number; name: string }>({
  mode,
  pool,
  maxAttempts,
  date: dateParam,
  hintsOf,
}: {
  mode: GameMode;
  pool: readonly T[];
  maxAttempts: number;
  /** The archive day from the URL; today without it. */
  date?: string;
  hintsOf: (answer: T) => Hint[];
}) {
  const game = useDailyGame(mode, maxAttempts, dateParam);
  const { gameState, isFinished, submitGuess, date } = game;
  const [shakeKey, setShakeKey] = useState(0);
  const [feedbackType, showFeedback] = useGuessFeedback();

  const answer = useMemo(
    () => (pool.length === 0 ? null : seededPick(pool, seededRandom(getModeSeed(date, mode)))),
    [pool, date, mode],
  );
  const hints = useMemo(() => (answer ? hintsOf(answer) : []), [answer, hintsOf]);

  const guessOptions = useMemo(() => {
    const guessed = new Set(gameState.guesses.map((guess) => guess.toLowerCase()));
    const seen = new Set<string>();
    return pool
      .filter((entry) => {
        const lower = entry.name.toLowerCase();
        if (guessed.has(lower) || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .map((entry) => ({ id: entry.id, name: entry.name }));
  }, [pool, gameState.guesses]);

  const guess = (_id: string | number, name: string) => {
    if (!answer || isFinished) return;
    const correct = name.toLowerCase() === answer.name.toLowerCase();
    submitGuess(name, correct);
    showFeedback(correct ? "correct" : "wrong");
    if (!correct) setShakeKey((key) => key + 1);
  };

  return {
    ...game,
    answer,
    hints,
    guessOptions,
    guess,
    /** Bumped by every wrong guess: keys the shake of the puzzle art. */
    shakeKey,
    feedbackType,
    feedbackMessage:
      feedbackType === "wrong"
        ? wrongGuessMessage(maxAttempts - gameState.guesses.length, hints[gameState.hintsRevealed - 1])
        : undefined,
  };
}
