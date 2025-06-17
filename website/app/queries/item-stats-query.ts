import { queryOptions } from "@tanstack/react-query";
import { API_ORIGIN } from "~/lib/constants";
import type { APIItemStats } from "~/types/api_item_stats";

export interface ItemStatsQueryParams {
  minMatches?: number | null;
  hero?: number | null;
  minRankId?: number;
  maxRankId?: number;
  minDateTimestamp?: number;
  maxDateTimestamp?: number;
  includeItems?: Set<number>;
  excludeItems?: Set<number>;
  bucket?:
    | "start_time_hour"
    | "start_time_day"
    | "game_time_min"
    | "game_time_normalized_percentage"
    | "net_worth_by_1000";
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
    ],
    queryFn: async (): Promise<APIItemStats[]> => {
      const url = new URL("/v1/analytics/item-stats", API_ORIGIN);
      if (hero) url.searchParams.set("hero_id", hero.toString());
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (includeItems?.size) url.searchParams.set("include_item_ids", Array.from(includeItems).join(","));
      if (excludeItems?.size) url.searchParams.set("exclude_item_ids", Array.from(excludeItems).join(","));
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      if (minMatches) url.searchParams.set("min_matches", minMatches.toString());

      if (bucket) url.searchParams.set("bucket", bucket);
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) return data;
      throw new Error("Error fetching item stats", { cause: data });
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}
