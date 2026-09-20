import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { queryKeys } from "~/queries/query-keys";

export const ITEM_TABLE_TRENDS = {
  winRate: { label: "Win Rate", format: "percent" },
  pickRate: { label: "Pick Rate", format: "percent" },
} as const;

export type ItemTableTrend = keyof typeof ITEM_TABLE_TRENDS;

export interface ItemStatTrendChartProps {
  params: AnalyticsApiItemStatsRequest;
  itemId: number;
  stat: ItemTableTrend;
  bucket: StatTrendBucket;
  onBucketChange: (bucket: StatTrendBucket) => void;
}

export default function ItemStatTrendChart({ params, itemId, stat, bucket, onBucketChange }: ItemStatTrendChartProps) {
  // `minMatches` would apply to every bucket on its own and drop the quiet ones; the sample floor below handles them.
  const itemParams = { ...params, minMatches: undefined, bucket };
  const itemQuery = useQuery({
    queryKey: queryKeys.analytics.itemStats(itemParams),
    queryFn: async () => (await api.analytics_api.itemStats(itemParams)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
  const chartData = useMemo(() => {
    const range = { minUnixTimestamp: params.minUnixTimestamp, maxUnixTimestamp: params.maxUnixTimestamp };
    const rows = completeTimeBuckets(itemQuery.data ?? [], bucket, range);
    // The table's pick rate is relative to the most bought item; each bucket is measured against its own.
    const mostBought = new Map<number, number>();
    for (const row of rows) mostBought.set(row.bucket, Math.max(mostBought.get(row.bucket) ?? 0, row.matches));
    return rows
      .filter((row) => row.item_id === itemId && row.matches >= MIN_MATCHES_PER_BUCKET)
      .sort((a, b) => a.bucket - b.bucket)
      .map((row) => ({
        date: row.bucket * 1000,
        value: stat === "winRate" ? row.wins / row.matches : row.matches / (mostBought.get(row.bucket) ?? row.matches),
        matches: row.matches,
      }));
  }, [itemQuery.data, bucket, itemId, stat, params.minUnixTimestamp, params.maxUnixTimestamp]);

  return (
    <StatTrendChart
      data={chartData}
      state={itemQuery.isPending ? "loading" : itemQuery.isError ? "error" : "ready"}
      stat={ITEM_TABLE_TRENDS[stat]}
      value={bucket}
      onValueChange={onBucketChange}
    />
  );
}
