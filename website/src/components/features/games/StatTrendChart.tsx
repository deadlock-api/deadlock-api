import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { PATCH_MARKERS_SHORT } from "~/components/domain/charts/PatchMarkers";
import StatTrendChart, { type StatTrendBucket } from "~/components/patterns/charts/StatTrendChart";
import type { StatDefinition } from "~/lib/game-stat-definitions";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { gameStatsQueryOptions } from "~/queries/games-query";

// The hover card's trend is read-only (its content is out of the tab order); the Over Time tab changes the interval.
const BUCKET: StatTrendBucket = "start_time_day";

export default function GameStatTrendChart({
  params,
  stat,
}: {
  params: AnalyticsApiGameStatsRequest;
  stat: StatDefinition;
}) {
  const { data, isPending, isError } = useQuery(gameStatsQueryOptions({ ...params, bucket: BUCKET }));
  const chartData = useMemo(
    () =>
      completeTimeBuckets(data ?? [], BUCKET, {
        minUnixTimestamp: params.minUnixTimestamp,
        maxUnixTimestamp: params.maxUnixTimestamp,
      })
        .sort((a, b) => a.bucket - b.bucket)
        .map((entry) => ({
          date: entry.bucket * 1000,
          value: entry[stat.key] ?? null,
          matches: stat.key === "total_matches" ? undefined : entry.total_matches,
        })),
    [data, stat.key, params.minUnixTimestamp, params.maxUnixTimestamp],
  );

  return (
    <StatTrendChart
      data={chartData}
      markers={PATCH_MARKERS_SHORT}
      state={isPending ? "loading" : isError ? "error" : "ready"}
      stat={stat}
      value={BUCKET}
    />
  );
}
