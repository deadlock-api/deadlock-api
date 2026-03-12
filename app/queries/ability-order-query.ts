import { queryOptions } from "@tanstack/react-query";
import type { AbilityOrderStatsGameModeEnum } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";

import { queryKeys } from "./query-keys";

export interface AbilityOrderQueryParams {
  heroId: number;
  minRankId?: number;
  maxRankId?: number;
  minDateTimestamp?: number;
  maxDateTimestamp?: number;
  minMatches?: number | null;
  gameMode?: AbilityOrderStatsGameModeEnum;
  includeItemIds?: number[];
  excludeItemIds?: number[];
}

export function abilityOrderQueryOptions(params: AbilityOrderQueryParams) {
  const { heroId, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, minMatches, gameMode, includeItemIds, excludeItemIds } = params;
  return queryOptions({
    queryKey: queryKeys.analytics.abilityOrderStats(params),
    queryFn: async () => {
      const response = await api.analytics_api.abilityOrderStats({
        heroId,
        gameMode,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        minMatches: minMatches,
        includeItemIds: includeItemIds?.length ? includeItemIds : undefined,
        excludeItemIds: excludeItemIds?.length ? excludeItemIds : undefined,
      });
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}
