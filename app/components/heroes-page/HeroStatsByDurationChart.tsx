import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

const DURATION_BUCKETS = [
  { label: "< 15m", minS: 0, maxS: 900 },
  { label: "15-20m", minS: 900, maxS: 1200 },
  { label: "20-25m", minS: 1200, maxS: 1500 },
  { label: "25-30m", minS: 1500, maxS: 1800 },
  { label: "30-35m", minS: 1800, maxS: 2100 },
  { label: "35-40m", minS: 2100, maxS: 2400 },
  { label: "40-45m", minS: 2400, maxS: 2700 },
  { label: "45-50m", minS: 2700, maxS: 3000 },
  { label: "50+m", minS: 3000, maxS: 7000 },
] as const;

const BEBOP_HERO_ID = 15;
const MIN_MATCHES_PER_BUCKET = 10;

interface HeroStatsByDurationChartProps {
  heroStat: (typeof HERO_STATS)[number];
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
}

export default function HeroStatsByDurationChart({
  heroStat,
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  gameMode,
}: HeroStatsByDurationChartProps) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const bucketQueries = useQueries({
    queries: DURATION_BUCKETS.map((bucket) => ({
      queryKey: [
        "api-hero-stats-by-duration",
        bucket.minS,
        bucket.maxS,
        minRankId,
        maxRankId,
        minDateTimestamp,
        maxDateTimestamp,
        minHeroMatches,
        minHeroMatchesTotal,
        gameMode,
      ],
      queryFn: async () => {
        const response = await api.analytics_api.heroStats({
          minHeroMatches,
          minHeroMatchesTotal,
          minAverageBadge: minRankId ?? 0,
          maxAverageBadge: maxRankId ?? 116,
          minUnixTimestamp: minDateTimestamp,
          maxUnixTimestamp: maxDateTimestamp,
          minDurationS: bucket.minS,
          maxDurationS: bucket.maxS,
          bucket: "no_bucket",
          gameMode,
        });
        return response.data;
      },
      staleTime: 24 * 60 * 60 * 1000,
    })),
  });

  const { data: assetsHeroes, isLoading: isLoadingAssetsHeroes } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const heroIdMap = useMemo(() => {
    const map: Record<number, { name: string; color: string }> = {};
    for (const hero of assetsHeroes || []) {
      map[hero.id] = { name: hero.name, color: `rgb(${hero.colors.ui.join(",")})` };
    }
    return map;
  }, [assetsHeroes]);

  const isLoading = bucketQueries.some((q) => q.isLoading) || isLoadingAssetsHeroes;
  const allLoaded = bucketQueries.every((q) => q.data != null);

  const formattedData = useMemo(() => {
    if (!allLoaded) return [];

    return DURATION_BUCKETS.map((bucket, i) => {
      const queryData = bucketQueries[i].data;
      if (!queryData) return { label: bucket.label };

      const row: Record<string, string | number> = { label: bucket.label };
      for (const entry of queryData) {
        if (entry.matches < MIN_MATCHES_PER_BUCKET) continue;
        const statValue = hero_stats_transform(entry, heroStat);
        row[entry.hero_id] =
          statValue > 100 ? Math.round(statValue) : Math.round(statValue * 100) / 100;
      }
      return row;
    });
  }, [allLoaded, bucketQueries, heroStat]);

  const sortedStats = useMemo(() => {
    const out: number[] = [];
    for (const row of formattedData) {
      for (const [key, value] of Object.entries(row)) {
        if (key === "label") continue;
        out.push(Number(value));
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }, [formattedData]);

  const minStat = useMemo(
    () => sortedStats[Math.floor(sortedStats.length * 0.2)] ?? 0,
    [sortedStats],
  );
  const maxStat = useMemo(
    () => sortedStats[Math.floor(sortedStats.length * 0.8)] ?? 100,
    [sortedStats],
  );

  const allHeroIds = useMemo(
    () =>
      Object.keys(heroIdMap)
        .map(Number)
        .sort((a, b) => (heroIdMap[a]?.name ?? "").localeCompare(heroIdMap[b]?.name ?? "")),
    [heroIdMap],
  );

  const [visibleHeroSet, setVisibleHeroSet] = useState<Set<number>>(() => new Set([BEBOP_HERO_ID]));

  const handleLegendClick = useCallback(
    (entry: { value?: string }) => {
      const heroId = allHeroIds.find(
        (id) => (heroIdMap[id]?.name ?? `Hero ${id}`) === entry.value,
      );
      if (heroId === undefined) return;
      setVisibleHeroSet((prev) => {
        const next = new Set(prev);
        if (next.has(heroId)) {
          next.delete(heroId);
        } else {
          next.add(heroId);
        }
        return next;
      });
    },
    [allHeroIds, heroIdMap],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full py-16">
        <LoadingLogo />
      </div>
    );
  }

  const visibleHeroIds = allHeroIds.filter((id) => visibleHeroSet.has(id));

  return (
    <ResponsiveContainer width="100%" height={800} className="p-4 bg-muted">
      <LineChart data={formattedData} margin={{ top: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
        <XAxis
          dataKey="label"
          label={{ value: "Match Duration", position: "insideBottom", offset: -10 }}
          stroke="#525252"
        />
        <YAxis
          domain={[minStat * 0.9, maxStat * 1.1]}
          label={{
            value: heroStat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            angle: -90,
            position: "insideLeft",
          }}
          tickFormatter={(value) =>
            heroStat === "winrate"
              ? `${Number(value).toFixed(1)}%`
              : Math.round(value).toLocaleString()
          }
          minTickGap={2}
          tickCount={10}
          stroke="#525252"
        />
        <Tooltip
          contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
          itemStyle={{ color: "#e5e5e5" }}
          formatter={(value: number) =>
            heroStat === "winrate" ? `${value.toFixed(2)}%` : value.toLocaleString()
          }
        />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          onClick={handleLegendClick}
          payload={allHeroIds.map((heroId) => ({
            value: heroIdMap[heroId]?.name ?? `Hero ${heroId}`,
            type: "line" as const,
            color: visibleHeroSet.has(heroId)
              ? (heroIdMap[heroId]?.color ?? "#ffffff")
              : "#555555",
          }))}
          wrapperStyle={{ cursor: "pointer", paddingTop: 30 }}
        />
        {visibleHeroIds.map((heroId) => (
          <Line
            key={heroId}
            type="monotone"
            dataKey={heroId}
            stroke={heroIdMap[heroId]?.color || "#ffffff"}
            dot={{ r: 4, className: "fill-primary" }}
            activeDot={{ r: 6 }}
            strokeWidth={2}
            name={heroIdMap[heroId]?.name}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
