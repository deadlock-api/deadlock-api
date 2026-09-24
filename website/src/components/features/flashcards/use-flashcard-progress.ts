import { useCallback, useMemo } from "react";

import { useStoredState } from "~/lib/use-stored-state";

import type { FlashcardStats } from "./FlashcardChrome";
import { EMPTY_FLASHCARD_STATS } from "./FlashcardChrome";

interface FlashcardProgress {
  stats: FlashcardStats;
  /** Cards answered right, which "No repeats" deals no more. */
  seenIds: number[];
}

const freshProgress = (): FlashcardProgress => ({ stats: EMPTY_FLASHCARD_STATS, seenIds: [] });

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isProgress(saved: FlashcardProgress): boolean {
  // Storage holds whatever an older version (or the user) left there.
  const { stats, seenIds } = (saved ?? {}) as Partial<FlashcardProgress>;
  return (
    stats != null &&
    isCount(stats.correct) &&
    isCount(stats.seen) &&
    isCount(stats.streak) &&
    isCount(stats.bestStreak) &&
    Array.isArray(seenIds) &&
    seenIds.every((id) => typeof id === "number")
  );
}

/**
 * A deck's "No repeats" setting, stats and mastered cards, saved per deck under `flashcards:<deck>:*` so a reload
 * keeps them. Everything holds the fresh values until `loaded`, since storage only exists in the browser.
 */
export function useFlashcardProgress(deck: string) {
  const [noRepeats, setNoRepeats, noRepeatsLoaded] = useStoredState(`flashcards:${deck}:no-repeats`, () => false, {
    accept: (saved) => typeof saved === "boolean",
  });
  const [progress, saveProgress, progressLoaded] = useStoredState(`flashcards:${deck}:progress`, freshProgress, {
    accept: isProgress,
  });
  const seenIds = useMemo(() => new Set(progress.seenIds), [progress.seenIds]);

  /** Counts an answer to card `id`; a right one masters it. Returns the mastered cards after it. */
  const recordAnswer = useCallback(
    (id: number, correct: boolean): Set<number> => {
      const { stats } = progress;
      const streak = correct ? stats.streak + 1 : 0;
      const nextSeenIds = correct && !seenIds.has(id) ? [...progress.seenIds, id] : progress.seenIds;
      saveProgress({
        stats: {
          correct: stats.correct + Number(correct),
          seen: stats.seen + 1,
          streak,
          bestStreak: Math.max(stats.bestStreak, streak),
        },
        seenIds: nextSeenIds,
      });
      return new Set(nextSeenIds);
    },
    [progress, seenIds, saveProgress],
  );

  const resetProgress = useCallback(() => saveProgress(freshProgress()), [saveProgress]);

  return {
    noRepeats,
    setNoRepeats,
    stats: progress.stats,
    seenIds,
    recordAnswer,
    resetProgress,
    loaded: noRepeatsLoaded && progressLoaded,
  };
}
