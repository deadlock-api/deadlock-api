import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";

import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { type WeekEntry, WeeklyTrendChart } from "~/components/patterns/charts/WeeklyTrendChart";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
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
  rankRange,
  className,
}: {
  className?: string;
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const period = useDefaultPeriodLabel();
  const weeklyRequest = { ...request, bucket: "start_time_week" as const };
  const { data, isPending, isError, isFetching, refetch } = useQuery({
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

  const first = weeks[0];
  const last = weeks.at(-1);
  // From the printed (rounded) rates, so "climbed 4.5 points from 45.7% to 50.2%" adds up for the reader.
  const delta =
    first && last
      ? Number(formatPercent(last.winRate).slice(0, -1)) - Number(formatPercent(first.winRate).slice(0, -1))
      : 0;
  // In percentage points: "-2.3%" from 64.6% to 62.3% reads as a relative change.
  const points = `${Math.abs(delta).toFixed(1)} points`;
  const movement =
    Math.abs(delta) < 1 ? "has held steady" : delta > 0 ? `has climbed ${points}` : `has slipped ${points}`;
  const chartLabel = `${heroName} win rate and pick rate by week`;

  return (
    <ChartCard
      className={className}
      title="Win Rate Over Time"
      description={`${rankRange} · week by week`}
      actions={weeks.length >= 2 && <Delta value={delta / 100} digits={1} unit=" pp" />}
      footer={
        first &&
        last &&
        weeks.length >= 2 && (
          <>
            {possessive(heroName)} win rate {movement}, from {formatPercent(first.winRate)} in the week of {first.label}{" "}
            to {formatPercent(last.winRate)} in the week of {last.label}, in {period}.
          </>
        )
      }
    >
      <PanelBody size="sm">
        {isError && !data ? (
          <ChartError label="win rate over time" retrying={isFetching} onRetry={() => void refetch()} />
        ) : isPending ? (
          <ChartLoading label={chartLabel} size="lg" />
        ) : weeks.length < 2 ? (
          <ChartEmpty label="weekly win rates" description="Fewer than two weeks of matches so far." />
        ) : (
          <WeeklyTrendChart variant="flush" weeks={weeks} shareLabel="Pick rate" label={chartLabel} />
        )}
      </PanelBody>
    </ChartCard>
  );
}
