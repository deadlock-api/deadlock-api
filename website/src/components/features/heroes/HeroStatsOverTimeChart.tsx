import { useQuery } from "@tanstack/react-query";
import type { HeroBanStatsBucketEnum, HeroStatsBucketEnum } from "deadlock_api_client";
import { parseAsArrayOf, parseAsInteger, useQueryState } from "nuqs";
import {
  type CSSProperties,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CartesianGrid,
  Customized,
  type DotItemDotProps,
  Line,
  LineChart,
  Curve,
  type LineDrawShapeProps,
  type MouseHandlerDataParam,
  ReferenceLine,
  type ScaleFunction,
  Tooltip,
  useYAxisScale,
  XAxis,
  YAxis,
} from "recharts";

import { ChartHeroSelector } from "~/components/domain/selectors/ChartHeroSelector";
import { HeroTrendSummary } from "~/components/features/heroes/HeroTrendSummary";
import { HeroTrendTooltip } from "~/components/features/heroes/HeroTrendTooltip";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartSidebarLayout } from "~/components/patterns/charts/ChartSidebarLayout";
import { ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_AXIS, CHART_BASELINE, CHART_COLOR, CHART_GRID } from "~/components/patterns/charts/theme";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Badge } from "~/components/ui/badge";
import { CACHE_DURATIONS } from "~/constants/cache";
import { type Dayjs, day } from "~/dayjs";
import { useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { BANS_PER_MATCH, computeBanRatesByBucket } from "~/lib/ban-rate";
import { formatCompactAxisTick, niceTicks } from "~/lib/chart-axis";
import { MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { buildHeroTrendPoints, HERO_TREND_LABELS, isPercentageTrend, type HeroTrendBuckets } from "~/lib/hero-trends";
import { wholeTimeBuckets } from "~/lib/time-buckets";
import { queryKeys } from "~/queries/query-keys";
import { type HERO_STATS_WITH_BAN_RATE, hero_stats_transform } from "~/types/api_hero_stats";

// Recharts still measures every x-axis label for vertical grid coordinates when vertical lines are disabled.
const noVerticalGridCoordinates = () => [];
const CHART_MARGIN = { top: 20, right: 12, bottom: 8, left: 0 };

/** Hands the chart's y scale to the hover handler, which runs outside the chart context the scale hook needs. */
function YScaleProbe({ scaleRef }: { scaleRef: RefObject<ScaleFunction | undefined> }) {
  const scale = useYAxisScale();
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale, scaleRef]);
  return null;
}

/** Markers for small series, including a chart with only one reading. */
function HeroTrendDot({ cx, cy, stroke, dataKey }: DotItemDotProps) {
  if (cx == null || cy == null) return null;
  return (
    <circle
      className={`recharts-line-dot hero-dot-${dataKey}`}
      cx={cx}
      cy={cy}
      r={2.5}
      fill={stroke}
      stroke="none"
      opacity={`var(--hero-opacity-${dataKey}, 1)`}
    />
  );
}

/** Draw isolated readings in one pass instead of creating a React dot component for every dense point. */
function HeroTrendShape({ heroId, ...props }: LineDrawShapeProps & { heroId: number }) {
  const points = props.points ?? [];
  return (
    <>
      {/* These lines never animate. Omit the animation ref to avoid Recharts measuring the whole SVG path on renders. */}
      <Curve
        points={points}
        type="linear"
        connectNulls={false}
        className={props.className}
        stroke={props.stroke}
        strokeWidth={props.strokeWidth}
        opacity={props.opacity}
        clipPath={props.clipPath}
        fill="none"
      />
      <g clipPath={props.clipPath} opacity={`var(--hero-opacity-${heroId}, 1)`}>
        {points.length > 100 &&
          points.flatMap((point, index) =>
            point.x != null && point.y != null && points[index - 1]?.y == null && points[index + 1]?.y == null
              ? [
                  <circle
                    key={point.x}
                    className={`recharts-line-dot hero-dot-${heroId}`}
                    cx={point.x}
                    cy={point.y}
                    r={3}
                    fill={props.stroke}
                    stroke="none"
                  />,
                ]
              : [],
          )}
      </g>
    </>
  );
}

export function HeroStatsOverTimeChart({
  heroStat,
  heroTimeInterval,
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  gameMode,
  matchMode,
}: {
  heroStat: (typeof HERO_STATS_WITH_BAN_RATE)[number];
  heroTimeInterval: HeroStatsBucketEnum;
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const isBanRate = heroStat === "ban_rate";
  const unsupportedBanRate = isBanRate && gameMode === "street_brawl";

  const heroStatsOverTimeQuery = {
    minHeroMatches: minHeroMatches,
    minHeroMatchesTotal: minHeroMatchesTotal,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    bucket: heroTimeInterval,
    gameMode: gameMode,
    matchMode,
  };
  const heroQuery = useQuery({
    queryKey: queryKeys.analytics.heroStatsOverTime(heroStatsOverTimeQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(heroStatsOverTimeQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: !isBanRate,
  });

  const banStatsOverTimeQuery = {
    bucket: heroTimeInterval as HeroBanStatsBucketEnum,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    matchMode,
  };
  const banQuery = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(banStatsOverTimeQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(banStatsOverTimeQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: isBanRate && !unsupportedBanRate,
  });

  const { data: heroData } = heroQuery;
  const banData = unsupportedBanRate ? undefined : banQuery.data;
  const activeQuery = isBanRate ? banQuery : heroQuery;

  const requiresSampleFloor = !isBanRate && heroStat !== "matches" && heroStat !== "wins" && heroStat !== "losses";
  const minMatchesPerBucket = useMemo(() => {
    if (!requiresSampleFloor) return 0;
    // Rates need a representative sample; exact counts remain useful even for tiny buckets.
    const sampleSizes = heroData?.map((hero) => hero.matches).sort((a, b) => a - b) ?? [];
    return Math.ceil(Math.max(MIN_MATCHES_PER_BUCKET, 0.1 * (sampleSizes[Math.floor(sampleSizes.length / 2)] ?? 0)));
  }, [heroData, requiresSampleFloor]);

  // Entries are [heroId, stat, matches]; ban rates carry no match count.
  const heroStatMap: HeroTrendBuckets = useMemo(() => {
    if (isBanRate) {
      if (!banData) return {};
      const rows = wholeTimeBuckets(banData, heroTimeInterval, { minUnixTimestamp, maxUnixTimestamp });
      const ratesByBucket = computeBanRatesByBucket(rows);
      // Like the heroes table's trend: a bucket with only a handful of matches is left out (two bans in six matches
      // plotted 33% and stretched the axis), and a hero nobody banned in a bucket is 0%, not a gap.
      const matchesByBucket = new Map<number, number>();
      for (const row of rows) {
        matchesByBucket.set(row.bucket, (matchesByBucket.get(row.bucket) ?? 0) + row.bans / BANS_PER_MATCH);
      }
      const bannedHeroes = new Set(rows.map((row) => row.hero_id));
      const map: Record<number, [number, number, number?][]> = {};
      for (const [bucket, heroRates] of ratesByBucket) {
        if (bucket < (minUnixTimestamp ?? 0) || (matchesByBucket.get(bucket) ?? 0) < MIN_MATCHES_PER_BUCKET) continue;
        map[bucket] = [...bannedHeroes].map((heroId) => [heroId, (heroRates.get(heroId) ?? 0) * 100]);
      }
      return map;
    }
    const map: Record<number, [number, number, number?][]> = {};
    if (heroData) {
      // The API's daily rollups count the whole start day, so a bucket that begins before the range would mix in the
      // hours before a season or patch boundary.
      const firstBucket = minUnixTimestamp ?? 0;
      for (const hero of wholeTimeBuckets(heroData, heroTimeInterval, { minUnixTimestamp, maxUnixTimestamp })) {
        if (hero.bucket < firstBucket) continue;
        if (!map[hero.bucket]) map[hero.bucket] = [];
        const value = hero_stats_transform(hero, heroStat);
        if (hero.matches < minMatchesPerBucket || !Number.isFinite(value)) continue;
        map[hero.bucket].push([hero.hero_id, value, hero.matches]);
      }
    }
    return map;
  }, [
    heroStat,
    heroData,
    isBanRate,
    banData,
    minUnixTimestamp,
    maxUnixTimestamp,
    heroTimeInterval,
    minMatchesPerBucket,
  ]);

  const { heroIdMap, isLoadingHeroes, isErrorHeroes, refetchHeroes, isFetchingHeroes } = useHeroColorMap();
  const heroIdsWithData = useMemo(
    () => [...new Set(Object.values(heroStatMap).flatMap((points) => points.map(([heroId]) => heroId)))],
    [heroStatMap],
  );
  const [selectedHeroIds, setSelectedHeroIds] = useQueryState("trend_heroes", parseAsArrayOf(parseAsInteger));
  const { allHeroIds, effectiveVisibleSet, setVisibleHeroes } = useChartHeroVisibility(heroIdMap, {
    heroIdFilter: heroIdsWithData,
    visibleHeroIds: selectedHeroIds,
    onVisibleHeroesChange: setSelectedHeroIds,
  });
  const visibleHeroIds = useMemo(
    () => allHeroIds.filter((id) => effectiveVisibleSet.has(id)),
    [allHeroIds, effectiveVisibleSet],
  );

  const minDataDate = useMemo(
    () => Math.min(...Object.keys(heroStatMap).map((d) => Number.parseInt(d, 10))),
    [heroStatMap],
  );
  const maxDataDate = useMemo(
    () => Math.max(...Object.keys(heroStatMap).map((d) => Number.parseInt(d, 10))),
    [heroStatMap],
  );

  const formattedData = useMemo(
    () => buildHeroTrendPoints(heroStatMap, heroTimeInterval),
    [heroStatMap, heroTimeInterval],
  );
  const selectedHeroes = useMemo(
    () =>
      visibleHeroIds.map((id) => ({
        id,
        name: heroIdMap[id]?.name ?? `Hero ${id}`,
        color: heroIdMap[id]?.color ?? "var(--foreground)",
      })),
    [visibleHeroIds, heroIdMap],
  );
  const pickerHeroes = useMemo(
    () =>
      Object.entries(heroIdMap)
        .map(([id, hero]) => ({ id: Number(id), name: hero.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [heroIdMap],
  );
  const pickerSelectedIds = useMemo(() => [...effectiveVisibleSet], [effectiveVisibleSet]);
  const statLabel = HERO_TREND_LABELS[heroStat];
  const isHourly = heroTimeInterval === "start_time_hour";
  const bucketCount = Object.values(heroStatMap).filter((stats) => stats.length > 0).length;

  const yTicks = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of formattedData) {
      for (const heroId of visibleHeroIds) {
        const value = point[heroId];
        if (typeof value !== "number") continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    return min <= max ? niceTicks(min, max, 8) : [0, 1];
  }, [formattedData, visibleHeroIds]);
  const isPercentStat = isPercentageTrend(heroStat);
  const dense = formattedData.length > 100;

  const [hoveredHeroId, setHoveredHeroId] = useState<number | null>(null);
  const throttleRef = useRef<number>(0);
  const yScaleRef = useRef<ScaleFunction | undefined>(undefined);

  const handleChartMouseMove = useCallback(
    (state: MouseHandlerDataParam, event: MouseEvent<SVGGraphicsElement>) => {
      const now = Date.now();
      if (now - throttleRef.current < 50) return;
      throttleRef.current = now;

      const point = state.isTooltipActive ? formattedData[Number(state.activeTooltipIndex)] : undefined;
      // Legend icons are recharts surfaces too; the plot is the wrapper's own svg.
      const surface = chartContainerRef.current?.querySelector(".recharts-wrapper > svg.recharts-surface");
      const yScale = yScaleRef.current;
      if (!point || !surface || !yScale) {
        setHoveredHeroId(null);
        return;
      }

      const mouseY = event.clientY - surface.getBoundingClientRect().top;
      let closest: number | null = null;
      let closestDist = Number.POSITIVE_INFINITY;
      for (const heroId of visibleHeroIds) {
        const value = point[heroId];
        const pixelY = typeof value === "number" ? yScale(value) : undefined;
        if (pixelY == null) continue;
        const dist = Math.abs(pixelY - mouseY);
        if (dist < closestDist) {
          closestDist = dist;
          closest = heroId;
        }
      }

      setHoveredHeroId(closest);
    },
    [formattedData, visibleHeroIds],
  );

  const handleChartMouseLeave = useCallback(() => {
    setHoveredHeroId(null);
  }, []);

  const chartContainerRef = useRef<HTMLElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  const highlightedId = hoveredHeroId != null && visibleHeroIds.includes(hoveredHeroId) ? hoveredHeroId : null;
  // Recharts recreates its separate marker layers; inherited variables keep every layer in sync.
  const highlightStyles = Object.fromEntries(
    visibleHeroIds.flatMap((heroId) => [
      [`--hero-opacity-${heroId}`, highlightedId === null || heroId === highlightedId ? 1 : 0.15],
      [`--hero-stroke-${heroId}`, heroId === highlightedId ? 3 : 2],
    ]),
  ) as CSSProperties;

  // Hover updates must not recreate axis registrations or the expensive series geometry.
  const chartAxes = useMemo(
    () => (
      <>
        <CartesianGrid {...CHART_GRID} verticalCoordinatesGenerator={noVerticalGridCoordinates} />
        <XAxis
          {...CHART_AXIS}
          dataKey="date"
          type="number"
          scale="time"
          domain={[
            minDataDate ? day.unix(minDataDate).valueOf() : "auto",
            maxDataDate ? day.unix(maxDataDate).valueOf() : "auto",
          ]}
          tickFormatter={(timestamp) => day.utc(timestamp).format(isHourly ? "MMM D HH:mm" : "MMM D")}
          minTickGap={isHourly ? 60 : 32}
        />
        <YAxis
          {...CHART_AXIS}
          domain={[yTicks[0], yTicks[yTicks.length - 1]]}
          ticks={yTicks}
          width={58}
          tickFormatter={(value: number) => {
            const text = formatCompactAxisTick(value, yTicks[1] - yTicks[0]);
            return isPercentStat ? `${text}%` : text;
          }}
        />
        {heroStat === "winrate" && yTicks[0] <= 50 && yTicks[yTicks.length - 1] >= 50 && (
          <ReferenceLine y={50} {...CHART_BASELINE} />
        )}
      </>
    ),
    [minDataDate, maxDataDate, isHourly, yTicks, isPercentStat, heroStat],
  );
  const chartSeries = useMemo(
    () =>
      visibleHeroIds.map((heroId) => (
        <Line
          key={heroId}
          className={`hero-line-${heroId}`}
          type="linear"
          dataKey={heroId}
          stroke={heroIdMap[heroId]?.color || CHART_COLOR.fallback}
          dot={dense ? false : HeroTrendDot}
          shape={(props) => <HeroTrendShape {...props} heroId={heroId} />}
          activeDot={{ r: 5 }}
          opacity={`var(--hero-opacity-${heroId}, 1)`}
          strokeWidth={`var(--hero-stroke-${heroId}, 2)`}
          name={heroIdMap[heroId]?.name ?? `Hero ${heroId}`}
          isAnimationActive={false}
          connectNulls={false}
        />
      )),
    [visibleHeroIds, heroIdMap, dense],
  );

  const isLoading = activeQuery.isLoading || isLoadingHeroes;

  if (unsupportedBanRate) {
    return (
      <EmptyState
        title="Ban rates are unavailable for Brawl"
        description="Choose another stat above or switch to a normal game mode to explore ban history."
      />
    );
  }

  if (activeQuery.isError || isErrorHeroes) {
    return (
      <ChartError
        label="hero trends"
        retrying={activeQuery.isFetching || isFetchingHeroes}
        onRetry={() => {
          if (activeQuery.isError) void activeQuery.refetch();
          if (isErrorHeroes) void refetchHeroes();
        }}
      />
    );
  }

  if (!isLoading && heroIdsWithData.length === 0) {
    return (
      <EmptyState
        title="No trend data for these filters"
        description={
          <>
            Try a wider date range or another time interval.
            {requiresSampleFloor &&
              ` This metric requires at least ${minMatchesPerBucket.toLocaleString("en-US")} matches per bucket.`}
          </>
        }
      />
    );
  }

  return (
    <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <ChartLoading label="hero trends" size="xl" />
      ) : (
        <div className="flex flex-col gap-3">
          <ChartSidebarLayout
            sidebar={
              <ChartHeroSelector
                heroes={pickerHeroes}
                availableHeroIds={allHeroIds}
                value={pickerSelectedIds}
                onValueChange={setVisibleHeroes}
                onHeroHighlight={setHoveredHeroId}
              />
            }
          >
            <ChartCard
              title={`${statLabel} over time`}
              description={
                <>
                  {day.unix(minDataDate).utc().format("MMM D, YYYY")} –{" "}
                  {day.unix(maxDataDate).utc().format("MMM D, YYYY")}
                  {" · "}
                  {bucketCount} {isHourly ? "hourly" : heroTimeInterval === "start_time_week" ? "weekly" : "daily"}{" "}
                  buckets · UTC
                </>
              }
              actions={
                <Badge variant="secondary">
                  {visibleHeroIds.length} {visibleHeroIds.length === 1 ? "hero" : "heroes"} selected
                </Badge>
              }
              footer={
                <>
                  Gaps indicate missing or insufficient data.{" "}
                  {heroStat === "winrate" &&
                    yTicks[0] <= 50 &&
                    yTicks[yTicks.length - 1] >= 50 &&
                    "Dashed line: 50% win rate. "}
                  {isBanRate && "Ban rates are unaffected by player match-count filters. "}
                  {requiresSampleFloor &&
                    `Buckets below ${minMatchesPerBucket.toLocaleString("en-US")} matches are omitted. `}
                  The ongoing interval is omitted when at least two completed intervals are available.
                </>
              }
            >
              {selectedHeroes.length > 0 && (
                <ChartLegend label="Selected heroes" className="px-3 pt-2 select-none">
                  {selectedHeroes.map((hero) => (
                    <ChartLegendItem key={hero.id} color={hero.color} shape="line">
                      {hero.name}
                    </ChartLegendItem>
                  ))}
                </ChartLegend>
              )}
              {visibleHeroIds.length === 0 ? (
                <EmptyState
                  variant="plain"
                  title={
                    effectiveVisibleSet.size === 0
                      ? "Choose heroes to compare"
                      : "Selected heroes have no data for these filters"
                  }
                  description="Select heroes in the picker or use Show all to display their trends."
                />
              ) : (
                <ChartSurface
                  ref={chartContainerRef}
                  style={highlightStyles}
                  onResize={setChartWidth}
                  variant="flush"
                  size="xl"
                  label={`Hero ${heroStat.replace(/_/g, " ")} over time chart`}
                >
                  <LineChart
                    data={formattedData}
                    margin={CHART_MARGIN}
                    onMouseMove={handleChartMouseMove}
                    onMouseLeave={handleChartMouseLeave}
                  >
                    {chartAxes}
                    <Tooltip
                      isAnimationActive={false}
                      wrapperStyle={{ pointerEvents: "auto" }}
                      position={chartWidth < 360 ? { x: 8 } : undefined}
                      content={(props) => (
                        <HeroTrendTooltip
                          {...props}
                          stat={heroStat}
                          hourly={isHourly}
                          highlightedHeroId={hoveredHeroId}
                        />
                      )}
                    />
                    <Customized component={<YScaleProbe scaleRef={yScaleRef} />} />
                    {chartSeries}
                  </LineChart>
                </ChartSurface>
              )}
            </ChartCard>
          </ChartSidebarLayout>
          {selectedHeroes.length > 0 && (
            <HeroTrendSummary
              points={formattedData}
              heroes={selectedHeroes}
              stat={heroStat}
              interval={heroTimeInterval}
            />
          )}
        </div>
      )}
    </div>
  );
}
