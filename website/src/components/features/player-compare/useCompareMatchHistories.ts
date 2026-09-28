import { useQueries } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { type MatchMode, modeFromParams } from "~/lib/game-mode";
import { filterMatches } from "~/lib/tracker/compute";
import type { CompareFilters } from "~/queries/player-compare-queries";
import { trackerMatchHistoryQueryOptions } from "~/queries/tracker-queries";

export interface CompareMatchHistory {
  accountId: number;
  /**
   * The player's matches on the page's mode and dates, newest first, on any hero: a rank or a shared match belongs to
   * the player, not to one hero. Undefined while loading or after a failure.
   */
  matches: PlayerMatchHistoryEntry[] | undefined;
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
  const queries = useQueries({ queries: accountIds.map((accountId) => trackerMatchHistoryQueryOptions(accountId)) });
  return accountIds.map((accountId, index) => {
    const query = queries[index];
    return {
      accountId,
      matches: query?.data
        ? filterMatches(query.data, {
            mode,
            heroId: null,
            minUnixTimestamp: filters.minUnixTimestamp,
            maxUnixTimestamp: filters.maxUnixTimestamp,
            result: "all",
          })
        : undefined,
      isPending: query?.isPending ?? true,
      isError: (query?.isError ?? false) && !query?.data,
      isPrivate: isAxiosError(query?.error) && query.error.response?.status === 403,
      refetch: () => void query?.refetch(),
    };
  });
}
