import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { type WeekEntry, WeeklyTrendChart } from "~/components/patterns/charts/WeeklyTrendChart";
import { Section } from "~/components/patterns/page/Section";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day } from "~/dayjs";
import { useDefaultPeriodLabel } from "~/hooks/useDefaultPeriodLabel";
import { api } from "~/lib/api";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent, possessive } from "~/lib/format";
import type { GameMode } from "~/lib/game-mode";
import { withoutOpenTimeBucket } from "~/lib/time-buckets";
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
  const period = useDefaultPeriodLabel();
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
    for (const row of withoutOpenTimeBucket(data, "start_time_week")) {
      all.set(row.bucket, (all.get(row.bucket) ?? 0) + row.matches);
      if (row.hero_id === heroId) hero.set(row.bucket, { wins: row.wins, matches: row.matches });
    }
    const multiplier = getPickrateMultiplier(request.gameMode);
    // The API's daily rollups count the whole start day, so a week that begins before the range would mix in the
    // hours before a season or patch boundary; with a rank filter, those can outnumber the first days after a reset.
    const firstWeek = request.minUnixTimestamp ?? 0;
    return [...hero.entries()]
      .filter(([weekStart, agg]) => weekStart >= firstWeek && agg.matches >= MIN_WEEK_MATCHES)
      .sort(([a], [b]) => a - b)
      .map(([weekStart, agg]): WeekEntry => ({
        weekStart,
        label: day.unix(weekStart).utc().format("MMM D"),
        winRate: agg.wins / agg.matches,
        share: (multiplier * agg.matches) / (all.get(weekStart) ?? agg.matches),
        matches: agg.matches,
      }));
  }, [data, heroId, request.gameMode, request.minUnixTimestamp]);

  if (isPending) {
    return <LoadingState label="win rate over time" align="center" className="py-8" />;
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
      title={`${heroName} Win Rate Over Time`}
      description={
        <>
          {possessive(heroName)} win rate <span className="font-semibold text-foreground">{movement}</span> from{" "}
          {formatPercent(first.winRate)} in the week of {first.label} to {formatPercent(last.winRate)} in the week of{" "}
          {last.label}. The solid line is win rate, the dashed line pick rate; both cover {period} week by week.
        </>
      }
    >
      <WeeklyTrendChart weeks={weeks} shareLabel="Pick rate" label={`${heroName} win rate and pick rate by week`} />
    </Section>
  );
}
