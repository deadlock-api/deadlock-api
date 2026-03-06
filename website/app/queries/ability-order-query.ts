import { queryOptions } from "@tanstack/react-query";
import type { AbilityOrderStatsGameModeEnum } from "deadlock_api_client";
import { api } from "~/lib/api";

export interface AbilityOrderQueryParams {
  heroId: number;
  minRankId?: number;
  maxRankId?: number;
  minDateTimestamp?: number;
  maxDateTimestamp?: number;
  minMatches?: number | null;
  gameMode?: AbilityOrderStatsGameModeEnum;
}

export function abilityOrderQueryOptions({
  heroId,
  minRankId,
  maxRankId,
  minDateTimestamp,
  maxDateTimestamp,
  minMatches,
  gameMode,
}: AbilityOrderQueryParams) {
  return queryOptions({
    queryKey: [
      "api-ability-order-stats",
      heroId,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      minMatches,
      gameMode,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.abilityOrderStats({
        heroId,
        gameMode,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        minMatches: minMatches,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}
