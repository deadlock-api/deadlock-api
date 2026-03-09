import { queryOptions } from "@tanstack/react-query";
import type { ItemStatsBucketEnum } from "deadlock_api_client/api";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { queryKeys } from "./query-keys";

export interface ItemStatsQueryParams {
  minMatches?: number | null;
  hero?: number | null;
  minRankId?: number;
  maxRankId?: number;
  minDateTimestamp?: number;
  maxDateTimestamp?: number;
  includeItems?: Set<number>;
  excludeItems?: Set<number>;
  bucket?: ItemStatsBucketEnum;
  minBoughtAtS?: number;
  maxBoughtAtS?: number;
  gameMode?: GameMode;
}

export function itemStatsQueryOptions({
  minMatches,
  hero,
  minRankId,
  maxRankId,
  minDateTimestamp,
  maxDateTimestamp,
  includeItems,
  excludeItems,
  bucket,
  minBoughtAtS,
  maxBoughtAtS,
  gameMode,
}: ItemStatsQueryParams) {
  return queryOptions({
    queryKey: queryKeys.analytics.itemStats(
      minMatches,
      hero,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      bucket,
      includeItems ? Array.from(includeItems) : "",
      excludeItems ? Array.from(excludeItems) : "",
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.itemStats({
        heroId: hero,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        includeItemIds: includeItems ? Array.from(includeItems) : undefined,
        excludeItemIds: excludeItems ? Array.from(excludeItems) : undefined,
        minMatches: minMatches,
        bucket: bucket,
        minBoughtAtS,
        maxBoughtAtS,
        gameMode,
      });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
