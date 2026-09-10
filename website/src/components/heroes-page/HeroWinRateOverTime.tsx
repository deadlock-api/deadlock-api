import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { type WeekEntry, WeeklyTrendChart } from "~/components/WeeklyTrendChart";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day } from "~/dayjs";
import { api } from "~/lib/api";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent, formatSignedPercent } from "~/lib/format";
import { queryKeys } from "~/queries/query-keys";

const MIN_WEEK_MATCHES = 300;

export function HeroWinRateOverTime({
  heroId,
  heroName,
  request,
}: {
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
}) {
  const weeklyRequest = { ...request, bucket: "start_time_week" as const };
  const { data, isPending } = useQuery({
    queryKey: queryKeys.analytics.heroStatsOverTime(weeklyRequest),
    queryFn: async () => (await api.analytics_api.heroStats(weeklyRequest)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const weeks = useMemo(() => {
    if (!data) return [];
    const hero = new Map<number, { wins: number; matches: number }>();
    const all = new Map<number, number>();
    for (const row of data) {
      all.set(row.bucket, (all.get(row.bucket) ?? 0) + row.matches);
      if (row.hero_id === heroId) hero.set(row.bucket, { wins: row.wins, matches: row.matches });
    }
    const multiplier = getPickrateMultiplier(request.gameMode);
    return [...hero.entries()]
      .filter(([, agg]) => agg.matches >= MIN_WEEK_MATCHES)
      .sort(([a], [b]) => a - b)
      .map(
        ([weekStart, agg]): WeekEntry => ({
          weekStart,
          label: day.unix(weekStart).format("MMM D"),
          winRate: agg.wins / agg.matches,
          share: (multiplier * agg.matches) / (all.get(weekStart) ?? agg.matches),
          matches: agg.matches,
        }),
      );
  }, [data, heroId, request.gameMode]);

  if (isPending) {
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
      <h2 className="text-xl font-semibold tracking-tight">{heroName} Win Rate Over Time</h2>
      <p className="text-sm text-muted-foreground">
        {heroName}&apos;s win rate{" "}
        <span className="font-semibold text-foreground">
          {movement} ({formatSignedPercent(delta)})
        </span>{" "}
        from {formatPercent(first.winRate)} in the week of {first.label} to {formatPercent(last.winRate)} in the week of{" "}
        {last.label}. The solid line is win rate, the dashed line pick rate; both cover the current season week by week.
      </p>
      <WeeklyTrendChart weeks={weeks} shareLabel="Pick rate" ariaLabel={`${heroName} win rate and pick rate by week`} />
    </section>
  );
}
