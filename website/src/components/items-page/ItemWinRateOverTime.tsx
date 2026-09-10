import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest, AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { type WeekEntry, WeeklyTrendChart } from "~/components/WeeklyTrendChart";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day } from "~/dayjs";
import { api } from "~/lib/api";
import { formatPercent, formatSignedPercent } from "~/lib/format";
import { queryKeys } from "~/queries/query-keys";

const MIN_WEEK_MATCHES = 200;

export function ItemWinRateOverTime({
  itemId,
  itemName,
  itemRequest,
  heroRequest,
}: {
  itemId: number;
  itemName: string;
  itemRequest: AnalyticsApiItemStatsRequest;
  heroRequest: AnalyticsApiHeroStatsRequest;
}) {
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
    return itemQuery.data
      .filter((row) => row.item_id === itemId && row.matches >= MIN_WEEK_MATCHES && playerMatches.has(row.bucket))
      .sort((a, b) => a.bucket - b.bucket)
      .map(
        (row): WeekEntry => ({
          weekStart: row.bucket,
          label: day.unix(row.bucket).format("MMM D"),
          winRate: row.wins / row.matches,
          share: row.matches / (playerMatches.get(row.bucket) ?? row.matches),
          matches: row.matches,
        }),
      );
  }, [itemQuery.data, heroQuery.data, itemId]);

  if (itemQuery.isPending || heroQuery.isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }
  if (weeks.length < 2) return null;

  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const delta = last.winRate - first.winRate;
  const movement = Math.abs(delta) < 0.01 ? "has held steady" : delta > 0 ? "has climbed" : "has slipped";

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{itemName} Win Rate Over Time</h2>
      <p className="text-sm text-muted-foreground">
        {itemName}&apos;s win rate{" "}
        <span className="font-semibold text-foreground">
          {movement} ({formatSignedPercent(delta)})
        </span>{" "}
        from {formatPercent(first.winRate)} in the week of {first.label} to {formatPercent(last.winRate)} in the week of{" "}
        {last.label}. The solid line is win rate, the dashed line how often it is bought; both cover the current season
        week by week.
      </p>
      <WeeklyTrendChart
        weeks={weeks}
        shareLabel="Bought"
        ariaLabel={`${itemName} win rate and purchase rate by week`}
      />
    </section>
  );
}
