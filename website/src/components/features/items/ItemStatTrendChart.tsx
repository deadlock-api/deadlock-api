import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { PATCH_MARKERS_SHORT } from "~/components/domain/charts/PatchMarkers";
import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import { ITEM_TABLE_TRENDS, type ItemTableTrend } from "~/lib/item-table-trends";
import type { StatTrendPoint } from "~/lib/stat-format";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { queryKeys } from "~/queries/query-keys";

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
  // With both kinds of purchase counted, the corrupted purchases are charted beside the normal ones.
  const splitCorrupted = params.corruptedItems === "include";
  const corruptedParams = { ...itemParams, corruptedItems: "only" as const };
  const itemQuery = useQuery({
    queryKey: queryKeys.analytics.itemStats(itemParams),
    queryFn: async () => (await api.analytics_api.itemStats(itemParams)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
  const corruptedQuery = useQuery({
    queryKey: queryKeys.analytics.itemStats(corruptedParams),
    queryFn: async () => (await api.analytics_api.itemStats(corruptedParams)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: splitCorrupted,
  });
  const itemData = itemQuery.data;
  const corruptedData = corruptedQuery.data;
  const chartData = useMemo(() => {
    const range = { minUnixTimestamp: params.minUnixTimestamp, maxUnixTimestamp: params.maxUnixTimestamp };
    const rows = completeTimeBuckets(itemData ?? [], bucket, range);
    // The table's pick rate is relative to the most bought item; each bucket is measured against its own.
    const mostBought = new Map<number, number>();
    for (const row of rows) mostBought.set(row.bucket, Math.max(mostBought.get(row.bucket) ?? 0, row.matches));
    const corruptedByBucket = new Map(
      splitCorrupted
        ? (corruptedData ?? []).filter((row) => row.item_id === itemId).map((row) => [row.bucket, row])
        : [],
    );
    const rate = (wins: number, matches: number, bucketStart: number) =>
      stat === "winRate" ? wins / matches : matches / (mostBought.get(bucketStart) ?? matches);
    return rows
      .filter((row) => row.item_id === itemId && row.matches >= MIN_MATCHES_PER_BUCKET)
      .sort((a, b) => a.bucket - b.bucket)
      .map((row): StatTrendPoint => {
        if (!splitCorrupted) {
          return { date: row.bucket * 1000, value: rate(row.wins, row.matches, row.bucket), matches: row.matches };
        }
        // The combined counts include the corrupted purchases: take them out for the normal series.
        const corrupted = corruptedByBucket.get(row.bucket);
        const corruptedMatches = Math.min(corrupted?.matches ?? 0, row.matches);
        const corruptedWins = Math.min(corrupted?.wins ?? 0, row.wins);
        const normalMatches = row.matches - corruptedMatches;
        return {
          date: row.bucket * 1000,
          value: normalMatches > 0 ? rate(row.wins - corruptedWins, normalMatches, row.bucket) : null,
          matches: normalMatches,
          comparison: corruptedMatches > 0 ? rate(corruptedWins, corruptedMatches, row.bucket) : null,
          comparisonMatches: corruptedMatches,
        };
      });
  }, [itemData, corruptedData, splitCorrupted, bucket, itemId, stat, params.minUnixTimestamp, params.maxUnixTimestamp]);

  const pending = itemQuery.isPending || (splitCorrupted && corruptedQuery.isPending);
  const failed = itemQuery.isError || (splitCorrupted && corruptedQuery.isError);
  return (
    <StatTrendChart
      data={chartData}
      markers={PATCH_MARKERS_SHORT}
      state={pending ? "loading" : failed ? "error" : "ready"}
      stat={ITEM_TABLE_TRENDS[stat]}
      value={bucket}
      onValueChange={onBucketChange}
      comparisonLabel={splitCorrupted ? "Corrupted" : undefined}
      valueLabel={splitCorrupted ? "Normal" : undefined}
    />
  );
}
