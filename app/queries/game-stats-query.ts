import { queryOptions } from "@tanstack/react-query";
import type { GameStatsBucketEnum } from "deadlock_api_client";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { api } from "~/lib/api";
import { queryKeys } from "./query-keys";

export interface GameStatsQueryParams {
  bucket?: GameStatsBucketEnum;
  gameMode?: GameMode;
  minUnixTimestamp?: number;
  maxUnixTimestamp?: number;
  minDurationS?: number;
  maxDurationS?: number;
  minAverageBadge?: number;
  maxAverageBadge?: number;
}

export function gameStatsQueryOptions(params: GameStatsQueryParams) {
  return queryOptions({
    queryKey: queryKeys.analytics.gameStats(
      params.bucket,
      params.gameMode,
      params.minUnixTimestamp,
      params.maxUnixTimestamp,
      params.minDurationS,
      params.maxDurationS,
      params.minAverageBadge,
      params.maxAverageBadge,
    ),
    queryFn: async () => {
      const response = await api.analytics_api.gameStats({
        bucket: params.bucket,
        gameMode: params.gameMode,
        minUnixTimestamp: params.minUnixTimestamp,
        maxUnixTimestamp: params.maxUnixTimestamp,
        minDurationS: params.minDurationS,
        maxDurationS: params.maxDurationS,
        minAverageBadge: params.minAverageBadge,
        maxAverageBadge: params.maxAverageBadge,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}
