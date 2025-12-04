import { queryOptions } from "@tanstack/react-query";
import type { ItemStatsBucketEnum } from "deadlock_api_client/api";
import { api } from "~/lib/api";

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
}: ItemStatsQueryParams) {
  return queryOptions({
    queryKey: [
      "api-item-stats",
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
    ],
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
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}
