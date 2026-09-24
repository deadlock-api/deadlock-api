import { useQueries } from "@tanstack/react-query";
import { parseAsArrayOf, parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartHeroSelector } from "~/components/domain/selectors/ChartHeroSelector";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartSidebarLayout } from "~/components/patterns/charts/ChartSidebarLayout";
import { ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_GRID, CHART_X_AXIS, CHART_X_LABEL, CHART_Y_AXIS } from "~/components/patterns/charts/theme";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { CHART_HEROES_QUERY_KEY, useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { formatCompactAxisTick, niceTicks } from "~/lib/chart-axis";
import { DURATION_BUCKETS, MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import type { GameMode, MatchMode } from "~/lib/game-mode";
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

  const {
    data: bucketData,
    isLoading: isLoadingBuckets,
    isError: isErrorBuckets,
    isFetching,
    refetch,
  } = useQueries({
    combine: (queries) => ({
      data: queries.map((query) => query.data),
      isLoading: queries.some((query) => query.isLoading),
      isError: queries.some((query) => query.isError),
      isFetching: queries.some((query) => query.isFetching),
      refetch: () => Promise.all(queries.map((query) => query.refetch())),
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

  const { heroIdMap, isLoadingHeroes, isErrorHeroes, refetchHeroes, isFetchingHeroes } = useHeroColorMap();

  const isLoading = isLoadingBuckets || isLoadingHeroes;
  const allLoaded = bucketData.every((data) => data != null);

  const requiresSampleFloor = !["matches", "wins", "losses"].includes(heroStat);

  const formattedData = useMemo(() => {
    if (!allLoaded) return [];

    return DURATION_BUCKETS.map((bucket, i) => {
      const queryData = bucketData[i];
      if (!queryData) return { label: bucket.label };

      const row: Record<string, string | number> = { label: bucket.label };
      for (const entry of queryData) {
        if (requiresSampleFloor && entry.matches < MIN_MATCHES_PER_BUCKET) continue;
        const statValue = hero_stats_transform(entry, heroStat);
        if (Number.isFinite(statValue)) row[entry.hero_id] = statValue;
      }
      return row;
    });
  }, [allLoaded, bucketData, heroStat, requiresSampleFloor]);

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
  const [selectedHeroIds, setSelectedHeroIds] = useQueryState(CHART_HEROES_QUERY_KEY, parseAsArrayOf(parseAsInteger));
  const { allHeroIds, effectiveVisibleSet, setVisibleHeroes } = useChartHeroVisibility(heroIdMap, {
    heroIdFilter: heroIdsWithData,
    value: selectedHeroIds,
    onValueChange: (ids) => void setSelectedHeroIds(ids),
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
        <ChartLoading label="hero duration data" size="xl" />
      ) : isErrorBuckets || isErrorHeroes ? (
        <ChartError
          label="hero duration data"
          retrying={isFetching || isFetchingHeroes}
          onRetry={() => {
            if (isErrorBuckets) void refetch();
            if (isErrorHeroes) void refetchHeroes();
          }}
        />
      ) : (
        <ChartSidebarLayout
          sidebar={
            <ChartHeroSelector
              heroes={pickerHeroes}
              availableHeroIds={allHeroIds}
              value={selectedIds}
              onValueChange={setVisibleHeroes}
            />
          }
        >
          <ChartCard
            aria-label="Duration chart"
            title={`${HERO_TREND_LABELS[heroStat]} by match duration`}
            footer={
              <>
                Gaps indicate missing data.
                {requiresSampleFloor && ` Buckets below ${MIN_MATCHES_PER_BUCKET} matches are omitted.`}
              </>
            }
          >
            {selectedIds.length > 0 && (
              <ChartLegend label="Selected heroes" className="px-3 pt-2 select-none">
                {selectedIds.map((heroId) => (
                  <ChartLegendItem key={heroId} color={heroIdMap[heroId]?.color ?? CHART_COLOR.fallback} shape="line">
                    {heroIdMap[heroId]?.name ?? `Hero ${heroId}`}
                  </ChartLegendItem>
                ))}
              </ChartLegend>
            )}
            {selectedIds.length === 0 ? (
              <EmptyState
                variant="plain"
                title={allHeroIds.length ? "Choose heroes to compare" : "No duration data for these filters"}
                description={
                  allHeroIds.length
                    ? "Select heroes in the picker or use Show all."
                    : "Try a wider date range or fewer filters."
                }
              />
            ) : (
              <ChartSurface
                variant="flush"
                size="xl"
                label={`Hero ${heroStat.replace(/_/g, " ")} by match duration chart`}
              >
                <LineChart data={formattedData} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid {...CHART_GRID} verticalCoordinatesGenerator={() => []} />
                  <XAxis
                    {...CHART_X_AXIS}
                    dataKey="label"
                    padding={{ left: 16, right: 16 }}
                    label={{ ...CHART_X_LABEL, value: "Match Duration" }}
                  />
                  <YAxis
                    {...CHART_Y_AXIS}
                    domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                    ticks={yTicks}
                    tickFormatter={(value: number) => {
                      const text = formatCompactAxisTick(value, yTicks.length > 1 ? yTicks[1] - yTicks[0] : 0);
                      return heroStat === "winrate" ? `${text}%` : text;
                    }}
                  />
                  <Tooltip
                    wrapperStyle={{ pointerEvents: "auto" }}
                    isAnimationActive={false}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <ChartReadings title={String(label)}>
                          {payload.map((entry) => (
                            <ChartReading key={String(entry.dataKey)} label={String(entry.name)} color={entry.color}>
                              {formatTrendValue(Number(entry.value), heroStat)}
                            </ChartReading>
                          ))}
                        </ChartReadings>
                      );
                    }}
                  />
                  {selectedIds.map((heroId) => (
                    <Line
                      key={heroId}
                      type="linear"
                      dataKey={heroId}
                      stroke={heroIdMap[heroId]?.color || CHART_COLOR.fallback}
                      dot={{ r: 4, fill: CHART_COLOR.primary }}
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
          </ChartCard>
        </ChartSidebarLayout>
      )}
    </div>
  );
}
