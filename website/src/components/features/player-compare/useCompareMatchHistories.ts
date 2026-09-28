import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { useCallback } from "react";

import { type MatchMode, modeFromParams } from "~/lib/game-mode";
import { filterMatches, rankHistoryPoints } from "~/lib/tracker/compute";
import type { CompareFilters } from "~/queries/player-compare-queries";
import { trackerMatchHistoryQueryOptions } from "~/queries/tracker-queries";

export interface CompareMatchHistory {
  accountId: number;
  /**
   * The player's matches on the page's mode and dates, newest first, on any hero: a rank or a shared match belongs to
   * the player, not to one hero. Undefined while loading or after a failure.
   */
  matches: PlayerMatchHistoryEntry[] | undefined;
  /**
   * The same matches on the page's hero only (all of them without a hero filter): what a player's own records,
   * match lengths and hours read, as the head-to-head does.
   */
  heroMatches: PlayerMatchHistoryEntry[] | undefined;
  /** Divisions gained (or lost) from the first to the last ranked match in range; null without two of them. */
  rankClimb: number | null;
  isPending: boolean;
  isError: boolean;
  /** The failure is the API refusing a protected (private) account: retrying will not help. */
  isPrivate: boolean;
  refetch: () => void;
}

/**
 * Every compared player's match history on the page's mode and dates, from the tracker's own query, so a
 * player opened in the tracker afterwards (or before) is already cached. The rank line, the recent form and the
 * together / against records all read it.
 */
export function useCompareMatchHistories(
  accountIds: readonly number[],
  filters: CompareFilters,
): CompareMatchHistory[] {
  const mode = modeFromParams(
    filters.gameMode === "street_brawl" ? "street_brawl" : "normal",
    filters.matchMode as MatchMode,
  );
  const { minUnixTimestamp, maxUnixTimestamp, heroId } = filters;
  const ids = accountIds.join(",");
  // One stable `combine` per players and filters: TanStack keeps its result while no query changes, so the filtering
  // (about 9k matches a player) runs once per answer rather than on every render, and what reads the histories stays
  // memoized too.
  const combine = useCallback(
    (queries: UseQueryResult<PlayerMatchHistoryEntry[]>[]): CompareMatchHistory[] => {
      const ordered = ids === "" ? [] : ids.split(",").map(Number);
      return ordered.map((accountId, index) => {
        const query = queries[index];
        const matches = query?.data
          ? filterMatches(query.data, { mode, heroId: null, minUnixTimestamp, maxUnixTimestamp, result: "all" })
          : undefined;
        const ranked = matches ? rankHistoryPoints(matches) : [];
        return {
          accountId,
          matches,
          heroMatches: heroId == null ? matches : matches?.filter((match) => match.hero_id === heroId),
          rankClimb: ranked.length >= 2 ? ranked.at(-1)!.linear - ranked[0].linear : null,
          isPending: query?.isPending ?? true,
          isError: (query?.isError ?? false) && !query?.data,
          isPrivate: isAxiosError(query?.error) && query.error.response?.status === 403,
          refetch: () => void query?.refetch(),
        };
      });
    },
    [ids, mode, minUnixTimestamp, maxUnixTimestamp, heroId],
  );
  return useQueries({
    queries: accountIds.map((accountId) => trackerMatchHistoryQueryOptions(accountId)),
    combine,
  });
}
