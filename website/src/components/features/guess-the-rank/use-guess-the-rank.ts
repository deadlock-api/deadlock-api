import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { getTodayDate } from "~/lib/daily-seed";
import { type DailyRound, resolveGuessDate } from "~/lib/guess-the-rank/daily";
import { roundPoints, tierDistance, tierOfBadge } from "~/lib/guess-the-rank/scoring";
import { getDailyRounds, getRoundResult, submitGuess } from "~/lib/guess-the-rank/server-fns";
import type { RoundResult } from "~/lib/guess-the-rank/votes";
import { useStoredDailyState } from "~/lib/use-stored-state";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { trackGuessTheRank, type WatchStats } from "./analytics";

/** One guessed round as the browser keeps it: enough to show the answer and score it without asking again. */
export interface GuessedRound {
  videoId: string;
  guess: number;
  badge: number;
}

/** How the clip was watched before the guess, sent with it. */
export type GuessContext = WatchStats & { ms_since_round_start: number; tier_changes: number };

interface GuessTheRankState {
  date: string;
  /** The guessed rounds, in round order: the next round to play is the first one past its end. */
  rounds: GuessedRound[];
}

function freshState(date: string): GuessTheRankState {
  return { date, rounds: [] };
}

export function gameStorageKey(date: string): string {
  return `guess-the-rank:game:${date}`;
}

function roundsQueryOptions(date: string) {
  return queryOptions({
    queryKey: ["guess-the-rank", "rounds", date],
    queryFn: () => getDailyRounds({ data: { date } }),
    staleTime: 10 * 60_000,
  });
}

function resultQueryKey(date: string, round: DailyRound) {
  return ["guess-the-rank", "result", date, round.round, round.videoId] as const;
}

/**
 * A guessed round's answer with the community's guesses, fresh from the server: right after a guess it is the vote's
 * own answer, after a reload it is read again. Null when the server has no vote from this visitor (another network).
 */
export function useRoundResult(date: string, round: DailyRound, enabled: boolean) {
  return useQuery({
    queryKey: resultQueryKey(date, round),
    queryFn: () => getRoundResult({ data: { date, round: round.round, videoId: round.videoId } }),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Today's (or an archive day's) game: its rounds, the guesses saved in this browser, and the guess itself. A round's
 * stored guess only counts while it is for the clip the server still plays in that round.
 */
export function useGuessTheRank(dateParam: string | undefined) {
  const date = resolveGuessDate(dateParam);
  const isArchive = date !== getTodayDate();
  const queryClient = useQueryClient();
  const roundsQuery = useQuery(roundsQueryOptions(date));
  const ranksQuery = useQuery(ranksQueryOptions);
  const [state, saveState, loaded] = useStoredDailyState(gameStorageKey(date), date, freshState);
  // The round just guessed, shown with its answer until "Next round"; the stored state has already moved on.
  const [revealing, setRevealing] = useState<number | null>(null);

  const rounds = useMemo(() => roundsQuery.data ?? [], [roundsQuery.data]);
  const guessed = rounds.map((round, i) => {
    const saved = state.rounds[i];
    return saved?.videoId === round.videoId ? saved : null;
  });
  const nextRound = guessed.findIndex((entry) => entry === null);
  const finished = rounds.length > 0 && nextRound === -1;
  const shownRound = revealing ?? (finished ? null : nextRound);

  const mutation = useMutation({
    mutationFn: ({ round, tier }: { round: DailyRound; tier: number; watch: GuessContext }) =>
      submitGuess({ data: { date, round: round.round, videoId: round.videoId, tier } }),
    onMutate: ({ round, tier, watch }) => {
      trackGuessTheRank("guess_submitted", {
        date,
        is_archive: isArchive,
        round: round.round,
        video_id: round.videoId,
        guessed_tier: tier,
        ...watch,
      });
    },
    onError: (error, { round }) => {
      trackGuessTheRank("error", {
        date,
        round: round.round,
        video_id: round.videoId,
        kind: "submit",
        message: error.message,
      });
    },
    onSuccess: (result: RoundResult, { round }) => {
      const distance = tierDistance(result.guess, result.tier);
      trackGuessTheRank("result_revealed", {
        date,
        is_archive: isArchive,
        round: round.round,
        video_id: round.videoId,
        guessed_tier: result.guess,
        actual_tier: result.tier,
        actual_badge: result.badge,
        distance,
        points: roundPoints(result.guess, result.tier),
        community_total: result.total,
      });
      queryClient.setQueryData(resultQueryKey(date, round), result);
      // Rounds are played in order, so every round before this one is guessed.
      const before = guessed.slice(0, round.round).filter((entry): entry is GuessedRound => entry !== null);
      saveState({ date, rounds: [...before, { videoId: round.videoId, guess: result.guess, badge: result.badge }] });
      setRevealing(round.round);
    },
  });

  const guess = useCallback(
    (tier: number, watch: GuessContext) => {
      if (shownRound == null || revealing != null || mutation.isPending) return;
      const round = rounds[shownRound];
      if (round) mutation.mutate({ round, tier, watch });
    },
    [shownRound, revealing, mutation, rounds],
  );

  const advance = useCallback(() => {
    if (revealing == null) return;
    const entry = guessed[revealing];
    const round = rounds[revealing];
    if (entry && round) {
      trackGuessTheRank("round_completed", {
        date,
        is_archive: isArchive,
        round: revealing,
        video_id: round.videoId,
        points: roundPoints(entry.guess, tierOfBadge(entry.badge)),
      });
    }
    const done = guessed.filter((item): item is GuessedRound => item !== null);
    if (done.length === rounds.length) {
      const distances = done.map((item) => tierDistance(item.guess, tierOfBadge(item.badge)));
      trackGuessTheRank("game_completed", {
        date,
        is_archive: isArchive,
        rounds: done.length,
        total_points: done.reduce((sum, item) => sum + roundPoints(item.guess, tierOfBadge(item.badge)), 0),
        distances,
      });
    }
    setRevealing(null);
  }, [revealing, guessed, rounds, date, isArchive]);

  return {
    date,
    isArchive,
    roundsQuery,
    ranksQuery,
    rounds,
    guessed,
    /** Storage has been read; before that the page cannot tell a fresh day from a finished one. */
    loaded,
    shownRound,
    revealing: revealing != null,
    finished: finished && revealing == null,
    guess,
    submitting: mutation.isPending,
    submitError: mutation.error,
    resetSubmitError: mutation.reset,
    advance,
  };
}
