import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartReadings } from "~/components/analytics/ChartReadings";
import { ChartSidebarLayout } from "~/components/analytics/ChartSidebarLayout";
import { ChartSurface } from "~/components/analytics/ChartSurface";
import { LoadingLogo } from "~/components/LoadingLogo";
import { ChartHeroSelector } from "~/components/selectors/ChartHeroSelector";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { MatchMode } from "~/components/selectors/MatchModeSelector";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "~/components/ui/empty";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { niceTicks } from "~/lib/chart-axis";
import { DURATION_BUCKETS, MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import { formatTrendValue, HERO_TREND_LABELS } from "~/lib/hero-trends";
import { queryKeys } from "~/queries/query-keys";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

interface HeroStatsByDurationChartProps {
  heroStat: (typeof HERO_STATS)[number];
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}

export function HeroStatsByDurationChart({
  heroStat,
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  gameMode,
  matchMode,
}: HeroStatsByDurationChartProps) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const { data: bucketData, isLoading: isLoadingBuckets } = useQueries({
    combine: (queries) => ({
      data: queries.map((query) => query.data),
      isLoading: queries.some((query) => query.isLoading),
    }),
    queries: DURATION_BUCKETS.map((bucket) => {
      const heroStatsByDurationQuery = {
        minHeroMatches,
        minHeroMatchesTotal,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minUnixTimestamp ?? 0,
        maxUnixTimestamp,
        minDurationS: bucket.minS,
        maxDurationS: bucket.maxS,
        bucket: "no_bucket" as const,
        gameMode,
        matchMode,
      };
      return {
        queryKey: queryKeys.analytics.heroStatsByDuration(heroStatsByDurationQuery),
        queryFn: async () => {
          const response = await api.analytics_api.heroStats(heroStatsByDurationQuery);
          return response.data;
        },
        staleTime: CACHE_DURATIONS.ONE_DAY,
      };
    }),
  });

  const { heroIdMap, isLoadingHeroes } = useHeroColorMap();

  const isLoading = isLoadingBuckets || isLoadingHeroes;
  const allLoaded = bucketData.every((data) => data != null);

  const formattedData = useMemo(() => {
    if (!allLoaded) return [];

    return DURATION_BUCKETS.map((bucket, i) => {
      const queryData = bucketData[i];
      if (!queryData) return { label: bucket.label };

      const row: Record<string, string | number> = { label: bucket.label };
      for (const entry of queryData) {
        if (entry.matches < MIN_MATCHES_PER_BUCKET) continue;
        const statValue = hero_stats_transform(entry, heroStat);
        row[entry.hero_id] = statValue > 100 ? Math.round(statValue) : Math.round(statValue * 100) / 100;
      }
      return row;
    });
  }, [allLoaded, bucketData, heroStat]);

  const heroIdsWithData = useMemo(
    () => [
      ...new Set(
        formattedData.flatMap((row) =>
          Object.keys(row)
            .filter((key) => key !== "label")
            .map(Number),
        ),
      ),
    ],
    [formattedData],
  );
  const { allHeroIds, effectiveVisibleSet, setVisibleHeroes } = useChartHeroVisibility(heroIdMap, {
    heroIdFilter: heroIdsWithData,
  });
  const selectedIds = allHeroIds.filter((id) => effectiveVisibleSet.has(id));
  const pickerHeroes = Object.entries(heroIdMap)
    .map(([id, hero]) => ({ id: Number(id), name: hero.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const yTicks = useMemo(() => {
    const values = formattedData.flatMap((row) =>
      allHeroIds.flatMap((heroId) => {
        const value = row[heroId];
        return effectiveVisibleSet.has(heroId) && typeof value === "number" ? [value] : [];
      }),
    );
    return values.length > 0 ? niceTicks(Math.min(...values), Math.max(...values), 8) : [0, 1];
  }, [formattedData, allHeroIds, effectiveVisibleSet]);

  return (
    <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : (
        <ChartSidebarLayout
          sidebar={
            <ChartHeroSelector
              heroes={pickerHeroes}
              availableHeroIds={allHeroIds}
              selectedHeroIds={selectedIds}
              onSelectionChange={setVisibleHeroes}
            />
          }
        >
          <section className="overflow-hidden rounded-xl border bg-card" aria-label="Duration chart">
            <h3 className="px-3 pt-3 text-sm font-semibold">{HERO_TREND_LABELS[heroStat]} by match duration</h3>
            {selectedIds.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {allHeroIds.length ? "Choose heroes to compare" : "No duration data for these filters"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {allHeroIds.length
                      ? "Select heroes in the picker or use Show all."
                      : "Try a wider date range or fewer filters."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ChartSurface
                label={`Hero ${heroStat.replace(/_/g, " ")} by match duration chart`}
                className="rounded-none border-0"
              >
                <LineChart data={formattedData} margin={{ top: 16, right: 12, bottom: 20, left: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                    verticalCoordinatesGenerator={() => []}
                  />
                  <XAxis
                    dataKey="label"
                    padding={{ left: 16, right: 16 }}
                    label={{ value: "Match Duration", position: "insideBottom", offset: -10 }}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                    ticks={yTicks}
                    width={64}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => {
                      const text = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
                      return heroStat === "winrate" ? `${text}%` : text;
                    }}
                    stroke="var(--muted-foreground)"
                  />
                  <Tooltip
                    wrapperStyle={{ pointerEvents: "auto" }}
                    isAnimationActive={false}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <ChartReadings
                          title={`${label} minutes`}
                          rows={payload.map((entry) => ({
                            label: String(entry.name),
                            value: formatTrendValue(Number(entry.value), heroStat),
                          }))}
                        />
                      );
                    }}
                  />
                  {selectedIds.map((heroId) => (
                    <Line
                      key={heroId}
                      type="linear"
                      dataKey={heroId}
                      stroke={heroIdMap[heroId]?.color || "#ffffff"}
                      dot={{ r: 4, className: "fill-primary" }}
                      activeDot={{ r: 6 }}
                      strokeWidth={2}
                      name={heroIdMap[heroId]?.name}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ChartSurface>
            )}
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Gaps indicate missing data or fewer than {MIN_MATCHES_PER_BUCKET} matches in a duration bucket.
            </p>
          </section>
        </ChartSidebarLayout>
      )}
    </div>
  );
}
