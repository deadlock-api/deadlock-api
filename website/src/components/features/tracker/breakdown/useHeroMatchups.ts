import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { useMemo } from "react";

import { computeHeroMatchups, MATCH_HEROES_CHUNK, type MatchTeams } from "~/lib/tracker/hero-matchups";
import { trackerMatchTeamsQueryOptions } from "~/queries/tracker-queries";

/** Module level, so `useQueries` combines again only when a chunk's result changes. */
function combineChunks(results: UseQueryResult<Record<number, MatchTeams>>[]) {
  return {
    teams: results.every((result) => result.data)
      ? Object.assign({}, ...results.map((result) => result.data))
      : undefined,
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
    isFetching: results.some((result) => result.isFetching),
    retry: () => {
      for (const result of results) if (result.isError) void result.refetch();
    },
  };
}

/**
 * The tracked player's results with and against every other hero in the filtered matches. Each match's heroes are
 * fetched in chunks of `MATCH_HEROES_CHUNK`, newest first, so a filter that only adds older matches keeps the
 * newer chunks cached.
 */
export function useHeroMatchups(entries: PlayerMatchHistoryEntry[]) {
  const chunks = useMemo(() => {
    const ids = [...new Set(entries.map((entry) => entry.match_id))].sort((a, b) => b - a);
    return Array.from({ length: Math.ceil(ids.length / MATCH_HEROES_CHUNK) }, (_, index) =>
      ids.slice(index * MATCH_HEROES_CHUNK, (index + 1) * MATCH_HEROES_CHUNK),
    );
  }, [entries]);
  const { teams, ...status } = useQueries({
    queries: chunks.map((ids) => trackerMatchTeamsQueryOptions(ids)),
    combine: combineChunks,
  });
  const matchups = useMemo(() => (teams ? computeHeroMatchups(entries, teams) : undefined), [entries, teams]);
  return { matchups, ...status };
}
