import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { PATCH_MARKERS_SHORT } from "~/components/domain/charts/PatchMarkers";
import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import type { StatDefinition } from "~/lib/game-stat-definitions";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { gameStatsQueryOptions } from "~/queries/games-query";

export default function GameStatTrendChart({
  params,
  stat,
  value: bucket,
  onValueChange,
}: {
  params: AnalyticsApiGameStatsRequest;
  stat: StatDefinition;
  value: StatTrendBucket;
  onValueChange: (value: StatTrendBucket) => void;
}) {
  const { data, isPending, isError } = useQuery(gameStatsQueryOptions({ ...params, bucket }));
  const chartData = useMemo(
    () =>
      completeTimeBuckets(data ?? [], bucket, {
        minUnixTimestamp: params.minUnixTimestamp,
        maxUnixTimestamp: params.maxUnixTimestamp,
      })
        .sort((a, b) => a.bucket - b.bucket)
        .map((entry) => ({
          date: entry.bucket * 1000,
          value: entry[stat.key] ?? null,
          matches: stat.key === "total_matches" ? undefined : entry.total_matches,
        })),
    [data, stat.key, bucket, params.minUnixTimestamp, params.maxUnixTimestamp],
  );

  return (
    <StatTrendChart
      data={chartData}
      markers={PATCH_MARKERS_SHORT}
      state={isPending ? "loading" : isError ? "error" : "ready"}
      stat={stat}
      value={bucket}
      onValueChange={onValueChange}
    />
  );
}
