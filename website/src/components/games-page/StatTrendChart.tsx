import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import StatTrendChart, { type StatTrendBucket } from "~/components/analytics/StatTrendChart";
import { completeTimeBuckets } from "~/lib/time-buckets";
import { gameStatsQueryOptions } from "~/queries/games-query";

import type { StatDefinition } from "./stat-definitions";

export default function GameStatTrendChart({
  params,
  stat,
  bucket,
  onBucketChange,
}: {
  params: AnalyticsApiGameStatsRequest;
  stat: StatDefinition;
  bucket: StatTrendBucket;
  onBucketChange: (bucket: StatTrendBucket) => void;
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
          value: entry[stat.key] as number,
          matches: stat.key === "total_matches" ? undefined : entry.total_matches,
        })),
    [data, stat.key, bucket, params.minUnixTimestamp, params.maxUnixTimestamp],
  );

  return (
    <StatTrendChart
      data={chartData}
      isPending={isPending}
      isError={isError}
      stat={stat}
      bucket={bucket}
      onBucketChange={onBucketChange}
    />
  );
}
