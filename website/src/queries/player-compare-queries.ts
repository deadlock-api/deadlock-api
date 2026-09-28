import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type {
  AnalyticsApiItemStatsRequest,
  AnalyticsApiPlayerScoreboardRequest,
  AnalyticsApiPlayerStatsMetricsRequest,
  PlayerHeroStatsGameModeEnum,
  PlayersApiEnemyStatsRequest,
  PlayersApiPlayerHeroStatsRequest,
} from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { FAVORITE_MIN_MATCHES } from "~/lib/compare-items";
import type { CompareFilterSearch } from "~/lib/compare-share";
import {
  DEFAULT_MATCH_MODE,
  type Mode,
  MODE_CONFIG,
  modeFromParams,
  parseAsGameMode,
  parseAsMatchMode,
} from "~/lib/game-mode";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";

import { queryKeys } from "./query-keys";

/** The filters every section of a comparison shares, as the page's filter bar sets them; a comparison has no rank filter. */
export interface CompareFilters {
  gameMode: PlayerHeroStatsGameModeEnum;
  matchMode: string;
  heroId: number | null;
  minUnixTimestamp: number | undefined;
  maxUnixTimestamp: number | undefined;
}

/**
 * A comparison's filters from its URL, with the page's defaults: the page, its loader and its share card all read
 * them here, so they ask for the same data. `defaultRange` is only awaited when the URL has no dates.
 */
export async function resolveCompareFilters(
  search: CompareFilterSearch,
  defaultRange: () => Promise<{ minUnixTimestamp: number; maxUnixTimestamp: number | undefined }>,
): Promise<{ filters: CompareFilters; mode: Mode; range: [Dayjs | undefined, Dayjs | undefined] | null }> {
  const mode = modeFromParams(
    parseAsGameMode.parse(search.game_mode ?? "") ?? "normal",
    parseAsMatchMode.parse(search.match_mode ?? "") ?? DEFAULT_MATCH_MODE,
  );
  const hero = Number(search.hero);
  const range = parseAsDayjsRange.parse(search.date_range ?? "");
  const time = range
    ? { minUnixTimestamp: normalizeUnixFloor(range[0]) ?? 0, maxUnixTimestamp: normalizeUnixCeil(range[1]) }
    : await defaultRange();
  return {
    filters: {
      gameMode: MODE_CONFIG[mode].gameMode,
      matchMode: MODE_CONFIG[mode].matchMode,
      heroId: Number.isInteger(hero) && hero > 0 ? hero : null,
      ...time,
    },
    mode,
    range,
  };
}

/** Sorted, so the same players in another order share one cache entry. */
export function sortedIds(accountIds: readonly number[]): number[] {
  return [...accountIds].sort((a, b) => a - b);
}

/** One request for every player: the API answers a row per player and hero. */
export function compareHeroStatsParams(
  accountIds: readonly number[],
  filters: CompareFilters,
): PlayersApiPlayerHeroStatsRequest {
  return {
    accountIds: sortedIds(accountIds),
    gameMode: filters.gameMode,
    matchMode: filters.matchMode,
    heroIds: filters.heroId != null ? String(filters.heroId) : undefined,
    // The metrics endpoint defaults a missing start to a month ago; every section passes one so they agree.
    minUnixTimestamp: filters.minUnixTimestamp ?? 0,
    maxUnixTimestamp: filters.maxUnixTimestamp,
  };
}

/** The population's distributions (no `accountId`) or one player's own, on the comparison's filters. */
export function compareMetricsParams(
  filters: CompareFilters,
  accountId?: number,
): AnalyticsApiPlayerStatsMetricsRequest {
  return {
    accountIds: accountId != null ? [accountId] : undefined,
    heroIds: filters.heroId != null ? String(filters.heroId) : undefined,
    gameMode: filters.gameMode,
    matchMode: filters.matchMode,
    minUnixTimestamp: filters.minUnixTimestamp ?? 0,
    maxUnixTimestamp: filters.maxUnixTimestamp,
  };
}

/** Suggested opponents: Ascendant and above, at least this many matches, best win rate first. */
const SUGGESTION_MIN_BADGE = 101;
const SUGGESTION_MIN_MATCHES = 15;
const SUGGESTION_LIMIT = 8;

export function compareSuggestionsParams(filters: CompareFilters): AnalyticsApiPlayerScoreboardRequest {
  // Street Brawl has no ranks, so no badge floor there.
  const minAverageBadge = filters.gameMode === "normal" ? SUGGESTION_MIN_BADGE : undefined;
  return {
    sortBy: "winrate",
    sortDirection: "desc",
    gameMode: filters.gameMode,
    matchMode: filters.matchMode,
    heroId: filters.heroId ?? undefined,
    minMatches: SUGGESTION_MIN_MATCHES,
    minAverageBadge,
    minUnixTimestamp: filters.minUnixTimestamp ?? 0,
    maxUnixTimestamp: filters.maxUnixTimestamp,
    start: 0,
    limit: SUGGESTION_LIMIT,
  };
}

/** A companion shared this few matches with the player is noise; the floor also keeps the response small. */
const COMPANION_MIN_MATCHES = 5;

/**
 * The players one player met most on the comparison's filters, as teammates (`trackerMateStatsQueryOptions`) or
 * opponents (`trackerEnemyStatsQueryOptions`); both take the same request. The roster has no hero or match mode
 * filter, so only the game mode and the dates apply.
 */
export function compareCompanionParams(accountId: number, filters: CompareFilters): PlayersApiEnemyStatsRequest {
  return {
    accountId,
    gameMode: filters.gameMode,
    minUnixTimestamp: filters.minUnixTimestamp ?? 0,
    maxUnixTimestamp: filters.maxUnixTimestamp,
    minMatchesPlayed: COMPANION_MIN_MATCHES,
  };
}

/** The current rank of several players in one request. */
export function playerRanksQueryOptions(accountIds: readonly number[]) {
  const ids = sortedIds(accountIds);
  return queryOptions({
    queryKey: queryKeys.players.rankBatch(ids),
    queryFn: async () => {
      const response = await api.players_api.rankBatch({ accountIds: ids });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });
}

/**
 * One player's item purchases on the comparison's filters, for `itemStatsQueryOptions`. One request per player:
 * `accountIds` would pool the players into one row per item.
 */
export function compareItemStatsParams(accountId: number, filters: CompareFilters): AnalyticsApiItemStatsRequest {
  return {
    accountId,
    gameMode: filters.gameMode,
    matchMode: filters.matchMode,
    heroIds: filters.heroId != null ? String(filters.heroId) : undefined,
    minUnixTimestamp: filters.minUnixTimestamp ?? 0,
    maxUnixTimestamp: filters.maxUnixTimestamp,
    // The API keeps items bought in 20+ matches by default; the panel draws its own, lower line.
    minMatches: FAVORITE_MIN_MATCHES,
  };
}

/**
 * A placeholder for one player's query in a `useQueries` list: the newest answer cached for the same account under
 * `prefix`, on any filters. `keepPreviousData` does not carry across when every key of the list changes at once (a
 * filter change), so this keeps the old numbers on screen until the new ones arrive instead of blanking the panels.
 */
export function lastAnswerForAccount<T>(client: QueryClient, prefix: string, accountId: number): () => T | undefined {
  return () => {
    let newest: { at: number; data: T } | undefined;
    for (const query of client.getQueryCache().findAll({ queryKey: [prefix] })) {
      const params = query.queryKey[1] as { accountId?: number; accountIds?: number[] } | undefined;
      const owner = params?.accountId ?? (params?.accountIds?.length === 1 ? params.accountIds[0] : undefined);
      const data = query.state.data as T | undefined;
      if (owner !== accountId || data === undefined) continue;
      if (!newest || query.state.dataUpdatedAt > newest.at) newest = { at: query.state.dataUpdatedAt, data };
    }
    return newest?.data;
  };
}
