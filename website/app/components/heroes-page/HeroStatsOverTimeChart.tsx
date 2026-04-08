import { useQuery } from "@tanstack/react-query";
import type { HeroStatsBucketEnum } from "deadlock_api_client/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import { type Dayjs, day } from "~/dayjs";
import { useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { api } from "~/lib/api";
import { queryKeys } from "~/queries/query-keys";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

function useEndLabelPositions(
  chartRef: React.RefObject<HTMLDivElement | null>,
  visibleHeroIds: number[],
  formattedData: Record<string, unknown>[],
) {
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({});

  useEffect(() => {
    // Wait a frame so Recharts has finished rendering paths
    const raf = requestAnimationFrame(() => {
      const el = chartRef.current;
      if (!el) return;
      const curves = el.querySelectorAll<SVGPathElement>(".recharts-line-curve");
      const containerRect = el.getBoundingClientRect();
      const pos: Record<number, { x: number; y: number }> = {};
      // Recharts renders Lines in the same order as visibleHeroIds.
      // Convert each endpoint to screen coords via getScreenCTM to
      // avoid issues with parent <g transform> offsets.
      for (let i = 0; i < curves.length && i < visibleHeroIds.length; i++) {
        const curve = curves[i];
        const len = curve.getTotalLength();
        if (len <= 0) continue;
        const localPt = curve.getPointAtLength(len);
        const ctm = curve.getScreenCTM();
        if (!ctm) continue;
        const screenX = localPt.x * ctm.a + localPt.y * ctm.c + ctm.e;
        const screenY = localPt.x * ctm.b + localPt.y * ctm.d + ctm.f;
        pos[visibleHeroIds[i]] = {
          x: screenX - containerRect.left,
          y: screenY - containerRect.top,
        };
      }
      setPositions(pos);
    });
    return () => cancelAnimationFrame(raf);
  }, [chartRef, visibleHeroIds, formattedData]);

  return positions;
}

function BumpEndLabels({
  positions,
  visibleHeroIds,
  heroIdMap,
  hoveredHeroId,
  onHoverHero,
  onLeaveHero,
}: {
  positions: Record<number, { x: number; y: number }>;
  visibleHeroIds: number[];
  heroIdMap: Record<number, { name: string; color: string }>;
  hoveredHeroId: number | null;
  onHoverHero: (id: number) => void;
  onLeaveHero: () => void;
}) {
  const labels = useMemo(() => {
    const entries = visibleHeroIds
      .map((heroId) => {
        const pos = positions[heroId];
        if (!pos) return null;
        return { heroId, x: pos.x, y: pos.y };
      })
      .filter(Boolean) as { heroId: number; x: number; y: number }[];

    // Sort by Y position to resolve collisions top-to-bottom
    entries.sort((a, b) => a.y - b.y);

    const MIN_GAP = 14; // minimum vertical gap between labels
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const curr = entries[i];
      if (curr.y - prev.y < MIN_GAP) {
        curr.y = prev.y + MIN_GAP;
      }
    }

    return entries;
  }, [positions, visibleHeroIds]);

  if (!labels.length) return null;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {labels.map(({ heroId, x, y }) => {
        const isHovered = hoveredHeroId === heroId;
        const isFaded = hoveredHeroId !== null && !isHovered;
        const heroColor = heroIdMap[heroId]?.color || "#ffffff";
        const heroName = heroIdMap[heroId]?.name ?? `Hero ${heroId}`;
        return (
          <text
            key={heroId}
            x={x + 8}
            y={y}
            fill={heroColor}
            fontSize={13}
            dominantBaseline="middle"
            opacity={isFaded ? 0.2 : 1}
            fontWeight={isHovered ? 700 : 400}
            style={{ cursor: "pointer", pointerEvents: "auto", transition: "opacity 0.15s" }}
            onMouseEnter={() => onHoverHero(heroId)}
            onMouseLeave={onLeaveHero}
          >
            {heroName}
          </text>
        );
      })}
    </svg>
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
  bumpChart = false,
}: {
  heroStat: (typeof HERO_STATS)[number];
  heroTimeInterval: HeroStatsBucketEnum;
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
  bumpChart?: boolean;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const heroStatsOverTimeQuery = {
    minHeroMatches: minHeroMatches,
    minHeroMatchesTotal: minHeroMatchesTotal,
    minAverageBadge: minRankId ?? 0,
    maxAverageBadge: maxRankId ?? 116,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
    bucket: heroTimeInterval,
    gameMode: gameMode,
  };
  const { data: heroData, isLoading: isLoadingHeroStats } = useQuery({
    queryKey: queryKeys.analytics.heroStatsOverTime(heroStatsOverTimeQuery),
    queryFn: async () => {
      const response = await api.analytics_api.heroStats(heroStatsOverTimeQuery);
      return response.data;
    },
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const heroStatMap: { [key: number]: [number, number][] } = useMemo(() => {
    const map: Record<number, [number, number][]> = {};
    if (heroData) {
      for (const hero of heroData) {
        if (!map[hero.bucket]) map[hero.bucket] = [];
        map[hero.bucket].push([hero.hero_id, hero_stats_transform(hero, heroStat)]);
      }
    }
    return map;
  }, [heroStat, heroData]);

  const { heroIdMap, isLoadingHeroes } = useHeroColorMap();
  const { allHeroIds, effectiveVisibleSet, handleLegendClick } = useChartHeroVisibility(heroIdMap, {
    showAllByDefault: bumpChart,
  });
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

  // rawStatByDate: maps date timestamp -> heroId -> formatted stat value (for bump tooltip)
  const { formattedData, rawStatByDate } = useMemo(() => {
    if (!heroStatMap) return { formattedData: [], rawStatByDate: {} as Record<number, Record<number, string>> };

    const data: { [key: string]: Date | number }[] = [];
    const rawMap: Record<number, Record<number, string>> = {};

    for (const [date, stats] of Object.entries(heroStatMap)) {
      const ts = Number.parseInt(date, 10);
      const dateObj = day.unix(ts);
      const obj: Record<string, Date | number> = {
        date: dateObj.toDate(),
      };

      if (bumpChart) {
        const sorted = [...stats].sort((a, b) => b[1] - a[1]);
        rawMap[ts] = {};
        for (let i = 0; i < sorted.length; i++) {
          obj[sorted[i][0]] = i + 1;
          const raw = sorted[i][1];
          rawMap[ts][sorted[i][0]] = raw > 100 ? Math.round(raw).toLocaleString() : raw.toFixed(2);
        }
      } else {
        for (const [heroId, stat] of stats) {
          obj[heroId] = stat > 100 ? Math.round(stat) : Number((Math.round(stat * 100) / 100).toFixed(2));
        }
      }

      data.push(obj);
    }

    return { formattedData: data, rawStatByDate: rawMap };
  }, [heroStatMap, bumpChart]);

  const totalHeroCount = useMemo(() => {
    if (!bumpChart) return 0;
    const firstBucket = Object.values(heroStatMap)[0];
    return firstBucket?.length ?? 0;
  }, [heroStatMap, bumpChart]);

  const [hoveredHeroId, setHoveredHeroId] = useState<number | null>(null);
  const labelHoveredRef = useRef(false);
  const throttleRef = useRef<number>(0);
  const plotAreaRef = useRef<{ top: number; height: number } | null>(null);

  // Invalidate cached plot area bounds when chart layout changes
  useEffect(() => {
    plotAreaRef.current = null;
  }, [formattedData, visibleHeroIds, bumpChart]);

  // biome-ignore lint/suspicious/noExplicitAny: Recharts CategoricalChartState type is too restrictive
  const handleChartMouseMove = useCallback(
    (state: any) => {
      if (labelHoveredRef.current) return;

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
      const areaHeight = plotAreaRef.current?.height ?? (bumpChart ? 880 : 560);
      const mouseY = state.chartY - top;

      const yMin = bumpChart ? 1 : minStat * 0.9;
      const yMax = bumpChart ? totalHeroCount : maxStat * 1.1;

      let closest: number | null = null;
      let closestDist = Number.POSITIVE_INFINITY;

      for (const entry of entries) {
        const val = entry.value as number;
        const normalized = (val - yMin) / (yMax - yMin);
        const pixelY = bumpChart ? normalized * areaHeight : (1 - normalized) * areaHeight;
        const dist = Math.abs(pixelY - mouseY);
        if (dist < closestDist) {
          closestDist = dist;
          closest = Number(entry.dataKey);
        }
      }

      setHoveredHeroId(closest);
    },
    [bumpChart, totalHeroCount, minStat, maxStat],
  );

  const handleChartMouseLeave = useCallback(() => {
    setHoveredHeroId(null);
  }, []);

  const handleLabelHoverHero = useCallback((id: number) => {
    labelHoveredRef.current = true;
    setHoveredHeroId(id);
  }, []);

  const handleLabelLeaveHero = useCallback(() => {
    labelHoveredRef.current = false;
    setHoveredHeroId(null);
  }, []);

  const chartContainerRef = useRef<HTMLDivElement>(null);

  const endLabelPositions = useEndLabelPositions(chartContainerRef, visibleHeroIds, formattedData);

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

      if (!bumpChart) {
        for (const dot of lineGroup.querySelectorAll<SVGElement>(".recharts-line-dot")) {
          dot.style.strokeOpacity = opacity;
        }
      }
    }
  }, [hoveredHeroId, visibleHeroIds, bumpChart]);

  const isLoading = isLoadingHeroStats || isLoadingHeroes;

  const bumpTooltipContent = useCallback(
    ({ label, payload }: { label?: string | number; payload?: any[] }) => {
      if (!payload?.length) return null;
      const items = [...payload].sort((a, b) => (a.value as number) - (b.value as number));
      const filtered =
        hoveredHeroId !== null ? items.filter((p) => String(p.dataKey) === String(hoveredHeroId)) : items.slice(0, 10);
      // Convert ms timestamp back to unix seconds to look up raw stats
      const bucketTs = label ? Math.round(day(label).unix()) : 0;
      // Find closest bucket key (timestamps may not match exactly)
      const bucketKeys = Object.keys(rawStatByDate).map(Number);
      const closestBucket = bucketKeys.reduce(
        (a, b) => (Math.abs(b - bucketTs) < Math.abs(a - bucketTs) ? b : a),
        bucketKeys[0],
      );
      const bucketStats = rawStatByDate[closestBucket];
      return (
        <div className="rounded border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2 text-xs">
          <p className="mb-1 text-[#a3a3a3]">{label ? day(label).format("YYYY-MM-DD") : ""}</p>
          {filtered.map((entry) => {
            const rawVal = bucketStats?.[Number(entry.dataKey)];
            return (
              <div key={String(entry.dataKey)} className="flex items-center gap-2 py-0.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-[#e5e5e5]">{entry.name}</span>
                <span className="ml-auto text-[#a3a3a3]">
                  {rawVal !== undefined ? `${rawVal}${heroStat === "winrate" ? "%" : ""}` : ""}
                </span>
                <span className="text-[#e5e5e5]">#{entry.value as number}</span>
              </div>
            );
          })}
          {hoveredHeroId === null && items.length > 10 && (
            <p className="mt-1 text-[#525252]">+{items.length - 10} more</p>
          )}
        </div>
      );
    },
    [hoveredHeroId, rawStatByDate, heroStat],
  );

  return (
    <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : (
        <div
          ref={chartContainerRef}
          role="img"
          aria-label={`Hero ${heroStat.replace(/_/g, " ")} over time chart`}
          className="relative bg-muted p-4"
        >
          <ResponsiveContainer width="100%" height={bumpChart ? 960 : 640}>
            <LineChart
              data={formattedData}
              margin={{ top: 20, right: bumpChart ? 120 : 20, bottom: 60 }}
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
                domain={bumpChart ? [1, totalHeroCount] : [minStat * 0.9, maxStat * 1.1]}
                reversed={bumpChart}
                label={{
                  value: bumpChart ? "Rank" : heroStat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                  angle: -90,
                  position: "insideLeft",
                }}
                tickFormatter={(value) => {
                  if (bumpChart) return `#${Math.round(value)}`;
                  return heroStat === "winrate" ? `${Math.round(value)}%` : Math.round(value).toLocaleString();
                }}
                minTickGap={2}
                tickCount={bumpChart ? Math.min(totalHeroCount, 20) : 10}
                stroke="#525252"
                allowDecimals={false}
              />
              <Tooltip
                labelFormatter={(label) => day(label).format("YYYY-MM-DD")}
                contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
                itemStyle={{ color: "#e5e5e5" }}
                formatter={(value: number) => (bumpChart ? `#${value}` : value)}
                itemSorter={(item) => (bumpChart ? (item.value as number) : 0)}
                {...(bumpChart && { content: bumpTooltipContent })}
              />
              {!bumpChart && (
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  iconType="line"
                  inactiveColor="#666666"
                  onClick={handleLegendClick}
                  wrapperStyle={{ cursor: "pointer", paddingTop: 30 }}
                />
              )}
              {allHeroIds.map((heroId) => (
                <Line
                  key={heroId}
                  type={bumpChart ? "bump" : "monotone"}
                  dataKey={heroId}
                  stroke={heroIdMap[heroId]?.color || "#ffffff"}
                  dot={bumpChart ? false : { r: 4, className: "fill-primary" }}
                  activeDot={bumpChart ? false : { r: 6 }}
                  strokeWidth={2}
                  name={heroIdMap[heroId]?.name ?? `Hero ${heroId}`}
                  isAnimationActive={false}
                  hide={!effectiveVisibleSet.has(heroId)}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {bumpChart && (
            <BumpEndLabels
              positions={endLabelPositions}
              visibleHeroIds={visibleHeroIds}
              heroIdMap={heroIdMap}
              hoveredHeroId={hoveredHeroId}
              onHoverHero={handleLabelHoverHero}
              onLeaveHero={handleLabelLeaveHero}
            />
          )}
        </div>
      )}
    </div>
  );
}
