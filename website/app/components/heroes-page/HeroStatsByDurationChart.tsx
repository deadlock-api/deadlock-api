import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useChartHeroVisibility, useHeroColorMap } from "~/hooks/useChartHeroVisibility";
import { api } from "~/lib/api";
import { DURATION_BUCKETS, MIN_MATCHES_PER_BUCKET } from "~/lib/constants";
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
}: HeroStatsByDurationChartProps) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const bucketQueries = useQueries({
    queries: DURATION_BUCKETS.map((bucket) => {
      const heroStatsByDurationQuery = {
        minHeroMatches,
        minHeroMatchesTotal,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        minDurationS: bucket.minS,
        maxDurationS: bucket.maxS,
        bucket: "no_bucket" as const,
        gameMode,
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
  const { visibleHeroIds, handleLegendClick, legendPayload } = useChartHeroVisibility(heroIdMap);

  const isLoading = bucketQueries.some((q) => q.isLoading) || isLoadingHeroes;
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
        row[entry.hero_id] = statValue > 100 ? Math.round(statValue) : Math.round(statValue * 100) / 100;
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

  const minStat = useMemo(() => sortedStats[Math.floor(sortedStats.length * 0.2)] ?? 0, [sortedStats]);
  const maxStat = useMemo(() => sortedStats[Math.floor(sortedStats.length * 0.8)] ?? 100, [sortedStats]);

  return (
    <div aria-live="polite" aria-busy={isLoading}>
      {isLoading ? (
        <div className="flex h-full w-full items-center justify-center py-16">
          <LoadingLogo />
        </div>
      ) : (
        <div role="img" aria-label={`Hero ${heroStat.replace(/_/g, " ")} by match duration chart`}>
          <ResponsiveContainer width="100%" height={800} className="bg-muted p-4">
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
                  heroStat === "winrate" ? `${Number(value).toFixed(1)}%` : Math.round(value).toLocaleString()
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
                payload={legendPayload}
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
        </div>
      )}
    </div>
  );
}
