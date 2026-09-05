import { useQuery } from "@tanstack/react-query";
import type { HeroBanStatsBucketEnum, HeroStatsBucketEnum } from "deadlock_api_client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { MatchMode } from "~/components/selectors/MatchModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import { type Dayjs, day } from "~/dayjs";
import { useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { computeBanRatesByBucket } from "~/lib/ban-rate";
import { queryKeys } from "~/queries/query-keys";
import { type HERO_STATS_WITH_BAN_RATE, hero_stats_transform } from "~/types/api_hero_stats";

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
  const { data: heroData, isLoading: isLoadingHeroStats } = useQuery({
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
  const { data: banData, isLoading: isLoadingBanStats } = useQuery({
    queryKey: queryKeys.analytics.heroBanStats(banStatsOverTimeQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroBanStats(banStatsOverTimeQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
    enabled: isBanRate,
  });

  const heroStatMap: { [key: number]: [number, number][] } = useMemo(() => {
    if (isBanRate) {
      if (!banData) return {};
      const ratesByBucket = computeBanRatesByBucket(banData);
      const map: Record<number, [number, number][]> = {};
      for (const [bucket, heroRates] of ratesByBucket) {
        map[bucket] = [];
        for (const [heroId, rate] of heroRates) {
          map[bucket].push([heroId, rate * 100]);
        }
      }
      return map;
    }
    const map: Record<number, [number, number][]> = {};
    if (heroData) {
      for (const hero of heroData) {
        if (!map[hero.bucket]) map[hero.bucket] = [];
        map[hero.bucket].push([hero.hero_id, hero_stats_transform(hero, heroStat)]);
      }
    }
    return map;
  }, [heroStat, heroData, isBanRate, banData]);

  const { heroIdMap, isLoadingHeroes } = useHeroColorMap();
  const { allHeroIds, effectiveVisibleSet, handleLegendClick } = useChartHeroVisibility(heroIdMap);
  const visibleHeroIds = useMemo(
    () => allHeroIds.filter((id) => effectiveVisibleSet.has(id)),
    [allHeroIds, effectiveVisibleSet],
  );

  const sortedStats = useMemo(() => {
    const out: number[] = [];
    for (const stats of Object.values(heroStatMap)) {
      for (const [, stat] of stats) {
        out.push(stat);
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }, [heroStatMap]);

  const minStat = useMemo(() => sortedStats[Math.floor(sortedStats.length * 0.2)] ?? 0, [sortedStats]);
  const maxStat = useMemo(() => sortedStats[Math.floor(sortedStats.length * 0.8)] ?? 100, [sortedStats]);

  const minDataDate = useMemo(
    () => Math.min(...Object.keys(heroStatMap).map((d) => Number.parseInt(d, 10))),
    [heroStatMap],
  );
  const maxDataDate = useMemo(
    () => Math.max(...Object.keys(heroStatMap).map((d) => Number.parseInt(d, 10))),
    [heroStatMap],
  );

  const formattedData = useMemo(
    () =>
      Object.entries(heroStatMap).map(([date, stats]) => {
        const point: Record<string, Date | number> = { date: day.unix(Number(date)).toDate() };
        for (const [heroId, stat] of stats) {
          point[heroId] = stat > 100 ? Math.round(stat) : Math.round(stat * 100) / 100;
        }
        return point;
      }),
    [heroStatMap],
  );

  const [hoveredHeroId, setHoveredHeroId] = useState<number | null>(null);
  const throttleRef = useRef<number>(0);
  const plotAreaRef = useRef<{ top: number; height: number } | null>(null);

  // Invalidate cached plot area bounds when chart layout changes
  useEffect(() => {
    plotAreaRef.current = null;
  }, [formattedData, visibleHeroIds]);

  // biome-ignore lint/suspicious/noExplicitAny: Recharts CategoricalChartState type is too restrictive
  const handleChartMouseMove = useCallback(
    (state: any) => {
      const now = Date.now();
      if (now - throttleRef.current < 50) return;
      throttleRef.current = now;

      if (!state?.activePayload?.length || !state.isTooltipActive || state.chartY == null) {
        setHoveredHeroId(null);
        return;
      }

      const entries = state.activePayload.filter((p: any) => p.dataKey !== "date");
      if (!entries.length) return;

      // Read actual plot area bounds from the SVG clipPath rect (Recharts' offset
      // is not included in the onMouseMove callback state).
      if (!plotAreaRef.current) {
        const clipRect = chartContainerRef.current?.querySelector("defs clipPath rect");
        if (clipRect) {
          plotAreaRef.current = {
            top: Number(clipRect.getAttribute("y")),
            height: Number(clipRect.getAttribute("height")),
          };
        }
      }

      const top = plotAreaRef.current?.top ?? 20;
      const areaHeight = plotAreaRef.current?.height ?? 560;
      const mouseY = state.chartY - top;

      const yMin = minStat * 0.9;
      const yMax = maxStat * 1.1;

      let closest: number | null = null;
      let closestDist = Number.POSITIVE_INFINITY;

      for (const entry of entries) {
        const val = entry.value as number;
        const normalized = (val - yMin) / (yMax - yMin);
        const pixelY = (1 - normalized) * areaHeight;
        const dist = Math.abs(pixelY - mouseY);
        if (dist < closestDist) {
          closestDist = dist;
          closest = Number(entry.dataKey);
        }
      }

      setHoveredHeroId(closest);
    },
    [minStat, maxStat],
  );

  const handleChartMouseLeave = useCallback(() => {
    setHoveredHeroId(null);
  }, []);

  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const lines = container.querySelectorAll<SVGGElement>(".recharts-line");
    for (let idx = 0; idx < lines.length; idx++) {
      const lineGroup = lines[idx];
      const curve = lineGroup.querySelector<SVGPathElement>(".recharts-line-curve");
      if (!curve) continue;

      const isHovered = visibleHeroIds[idx] === hoveredHeroId;
      const opacity = hoveredHeroId === null ? "1" : isHovered ? "1" : "0.15";
      const width = isHovered ? "3" : "2";
      curve.style.strokeOpacity = opacity;
      curve.style.strokeWidth = width;

      for (const dot of lineGroup.querySelectorAll<SVGElement>(".recharts-line-dot")) {
        dot.style.strokeOpacity = opacity;
      }
    }
  }, [hoveredHeroId, visibleHeroIds]);

  const isLoading = isLoadingHeroStats || isLoadingBanStats || isLoadingHeroes;

  return (
    <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : (
        <div
          ref={chartContainerRef}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="img"
          aria-label={`Hero ${heroStat.replace(/_/g, " ")} over time chart`}
          className="relative bg-muted p-4"
        >
          <ResponsiveContainer width="100%" height={640}>
            <LineChart
              data={formattedData}
              margin={{ top: 20, right: 20, bottom: 60 }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis
                dataKey="date"
                type="number"
                scale="time"
                domain={[
                  minDataDate ? day.unix(minDataDate).valueOf() : "auto",
                  maxDataDate ? day.unix(maxDataDate).valueOf() : "auto",
                ]}
                tickFormatter={(timestamp) => day(timestamp).format("MM/DD/YY")}
                label={{ value: "Date", position: "insideBottom", offset: -10 }}
                stroke="#525252"
              />
              <YAxis
                domain={[minStat * 0.9, maxStat * 1.1]}
                label={{
                  value: heroStat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                  angle: -90,
                  position: "insideLeft",
                }}
                tickFormatter={(value) => {
                  return heroStat === "winrate" ? `${Math.round(value)}%` : Math.round(value).toLocaleString();
                }}
                minTickGap={2}
                tickCount={10}
                stroke="#525252"
                allowDecimals={false}
              />
              <Tooltip
                labelFormatter={(label) => day(label).format("YYYY-MM-DD")}
                contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
                itemStyle={{ color: "#e5e5e5" }}
                formatter={(value) => value}
                itemSorter={() => 0}
              />
              <Legend
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
                iconType="line"
                inactiveColor="#666666"
                onClick={handleLegendClick}
                wrapperStyle={{ cursor: "pointer", paddingTop: 30 }}
              />
              {allHeroIds.map((heroId) => (
                <Line
                  key={heroId}
                  type="monotone"
                  dataKey={heroId}
                  stroke={heroIdMap[heroId]?.color || "#ffffff"}
                  dot={{ r: 4, className: "fill-primary" }}
                  activeDot={{ r: 6 }}
                  strokeWidth={2}
                  name={heroIdMap[heroId]?.name ?? `Hero ${heroId}`}
                  isAnimationActive={false}
                  hide={!effectiveVisibleSet.has(heroId)}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
