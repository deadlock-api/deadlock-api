import { getAnalytics } from "~/lib/analytics";

import type { GameMode } from "./types";

// Deadlockdle's product analytics (PostHog, through the site's `getAnalytics`: production only, cookieless). Every
// event is `deadlockdle_<name>` and carries the mode, the puzzle day and whether it is an archive day. A game starts
// with its first guess or answer and completes once, when its result is decided; answers are never sent.

type Properties = Record<string, string | number | boolean | null>;

export function trackDeadlockdle(
  name: "game_started" | "guess_submitted" | "game_completed" | "share_clicked" | "next_game_clicked",
  mode: GameMode | "all",
  date: string,
  isArchive: boolean,
  properties: Properties = {},
) {
  void getAnalytics().then((posthog) =>
    posthog?.capture(`deadlockdle_${name}`, { mode, date, is_archive: isArchive, ...properties }),
  );
}

/**
 * A quiz mode's answer (trivia, higher or lower): `game_started` with the first, `guess_submitted` for each, and
 * `game_completed` with the last.
 */
export function trackQuizAnswer(
  mode: GameMode,
  date: string,
  isArchive: boolean,
  { question, total, correct, score }: { question: number; total: number; correct: boolean; score: number },
) {
  if (question === 0) trackDeadlockdle("game_started", mode, date, isArchive);
  trackDeadlockdle("guess_submitted", mode, date, isArchive, { attempt: question + 1, correct });
  if (question >= total - 1) {
    trackDeadlockdle("game_completed", mode, date, isArchive, {
      score,
      max_score: total,
      score_pct: Math.round((score / total) * 100),
    });
  }
}
