import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { ChartLoading } from "~/components/patterns/charts/ChartStates";
import { type WeekEntry, WeeklyTrendChart } from "~/components/patterns/charts/WeeklyTrendChart";
import { Section } from "~/components/patterns/page/Section";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day } from "~/dayjs";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { api } from "~/lib/api";
import { formatPercent, possessive } from "~/lib/format";
import { withoutOpenTimeBucket } from "~/lib/time-buckets";
import { queryKeys } from "~/queries/query-keys";

const MIN_WEEK_MATCHES = 200;

export function ItemWinRateOverTime({
  itemId,
  itemName,
  itemRequest,
  heroRequest,
  rankRange,
}: {
  itemId: number;
  itemName: string;
  itemRequest: AnalyticsApiItemStatsRequest;
  heroRequest: AnalyticsApiHeroStatsRequest;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const period = useDefaultPeriodLabel();
  const weeklyItemRequest = { ...itemRequest, bucket: "start_time_week" as const };
  const weeklyHeroRequest = { ...heroRequest, bucket: "start_time_week" as const };
  const itemQuery = useQuery({
    queryKey: queryKeys.analytics.itemStats(weeklyItemRequest),
    queryFn: async () => (await api.analytics_api.itemStats(weeklyItemRequest)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
  // Same request as the hero page's weekly chart, so the two share one cache entry.
  const heroQuery = useQuery({
    queryKey: queryKeys.analytics.heroStatsOverTime(weeklyHeroRequest),
    queryFn: async () => (await api.analytics_api.heroStats(weeklyHeroRequest)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const weeks = useMemo(() => {
    if (!itemQuery.data || !heroQuery.data) return [];
    const playerMatches = new Map<number, number>();
    for (const row of heroQuery.data) playerMatches.set(row.bucket, (playerMatches.get(row.bucket) ?? 0) + row.matches);
    // The API's daily rollups count the whole start day, so a week that begins before the range would mix in the
    // hours before a season or patch boundary.
    const firstWeek = itemRequest.minUnixTimestamp ?? 0;
    return withoutOpenTimeBucket(itemQuery.data, "start_time_week")
      .filter(
        (row) =>
          row.item_id === itemId &&
          row.bucket >= firstWeek &&
          row.matches >= MIN_WEEK_MATCHES &&
          playerMatches.has(row.bucket),
      )
      .sort((a, b) => a.bucket - b.bucket)
      .map((row): WeekEntry => ({
        weekStart: row.bucket,
        label: day.unix(row.bucket).utc().format("MMM D"),
        winRate: row.wins / row.matches,
        share: row.matches / (playerMatches.get(row.bucket) ?? row.matches),
        matches: row.matches,
      }));
  }, [itemQuery.data, heroQuery.data, itemId, itemRequest.minUnixTimestamp]);

  if (itemQuery.isPending || heroQuery.isPending) return <ChartLoading label={`${itemName} win rate over time`} />;
  const failed = [itemQuery, heroQuery].filter((query) => query.isError && !query.data);
  if (failed.length > 0) {
    return (
      <Section title={`${itemName} Win Rate Over Time`}>
        <ErrorState
          title={`Could not load ${possessive(itemName)} win rate over time`}
          retrying={failed.some((query) => query.isFetching)}
          onRetry={() => failed.forEach((query) => void query.refetch())}
        />
      </Section>
    );
  }
  if (weeks.length < 2) return null;

  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  // From the printed (rounded) rates, so "climbed 4.5 points from 45.7% to 50.2%" adds up for the reader.
  const delta = Number(formatPercent(last.winRate).slice(0, -1)) - Number(formatPercent(first.winRate).slice(0, -1));
  // In percentage points: "-2.3%" from 64.6% to 62.3% reads as a relative change.
  const points = `${Math.abs(delta).toFixed(1)} points`;
  const movement =
    Math.abs(delta) < 1 ? "has held steady" : delta > 0 ? `has climbed ${points}` : `has slipped ${points}`;

  return (
    <Section
      title={`${itemName} Win Rate Over Time`}
      description={
        <>
          {possessive(itemName)} win rate <span className="font-semibold text-foreground">{movement}</span> from{" "}
          {formatPercent(first.winRate)} in the week of {first.label} to {formatPercent(last.winRate)} in the week of{" "}
          {last.label}. The upper line is win rate against a dashed 50% mark, the lower one how often it is bought; both
          cover {rankRange} matches in {period}, week by week.
        </>
      }
    >
      <WeeklyTrendChart weeks={weeks} shareLabel="Bought" label={`${itemName} win rate and purchase rate by week`} />
    </Section>
  );
}
