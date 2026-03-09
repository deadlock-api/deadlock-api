import { useQuery } from "@tanstack/react-query";
import type { HeroStatsBucketEnum } from "deadlock_api_client/api";
import { useCallback, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { type Dayjs, day } from "~/dayjs";
import { api } from "~/lib/api";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

const BEBOP_HERO_ID = 15;

export default function HeroStatsOverTimeChart({
  heroStat,
  heroTimeInterval,
  minRankId,
  maxRankId,
  minHeroMatches,
  minHeroMatchesTotal,
  minDate,
  maxDate,
  gameMode,
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
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading: isLoadingHeroStats } = useQuery({
    queryKey: [
      "api-hero-stats-over-time",
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      heroTimeInterval,
      minHeroMatches,
      minHeroMatchesTotal,
      gameMode,
    ],
    queryFn: async () => {
      const response = await api.analytics_api.heroStats({
        minHeroMatches: minHeroMatches,
        minHeroMatchesTotal: minHeroMatchesTotal,
        minAverageBadge: minRankId ?? 0,
        maxAverageBadge: maxRankId ?? 116,
        minUnixTimestamp: minDateTimestamp,
        maxUnixTimestamp: maxDateTimestamp,
        bucket: heroTimeInterval,
        gameMode: gameMode,
      });
      return response.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
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

  const { data: assetsHeroes, isLoading: isLoadingAssetsHeroes } = useQuery(heroesQueryOptions);

  const heroIdMap = useMemo(() => {
    const map: Record<number, { name: string; color: string }> = {};
    for (const hero of assetsHeroes || []) {
      map[hero.id] = { name: hero.name, color: `rgb(${hero.colors.ui.join(",")})` };
    }
    return map;
  }, [assetsHeroes]);

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

  const minStat = useMemo(() => sortedStats[Math.floor(sortedStats.length * 0.2)], [sortedStats]);
  const maxStat = useMemo(() => sortedStats[Math.floor(sortedStats.length * 0.8)], [sortedStats]);

  const minDataDate = useMemo(
    () => Math.min(...Object.keys(heroStatMap).map((d) => Number.parseInt(d, 10))),
    [heroStatMap],
  );
  const maxDataDate = useMemo(
    () => Math.max(...Object.keys(heroStatMap).map((d) => Number.parseInt(d, 10))),
    [heroStatMap],
  );

  const formattedData = useMemo(() => {
    if (!heroStatMap) return [];

    const data: { [key: string]: Date | number }[] = [];

    for (const [date, stats] of Object.entries(heroStatMap)) {
      const dateObj = day.unix(Number.parseInt(date, 10));
      const obj = {
        date: dateObj.toDate(),
      };
      for (const [heroId, stat] of stats) {
        Object.assign(obj, { [heroId]: stat > 100 ? Math.round(stat) : (Math.round(stat * 100) / 100).toFixed(2) });
      }
      data.push(obj);
    }

    return data;
  }, [heroStatMap]);

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
      const heroId = allHeroIds.find((id) => (heroIdMap[id]?.name ?? `Hero ${id}`) === entry.value);
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

  if (isLoadingHeroStats || isLoadingAssetsHeroes) {
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
          tickFormatter={(value) =>
            heroStat === "winrate" ? `${Math.round(value)}%` : Math.round(value).toLocaleString()
          }
          minTickGap={2}
          tickCount={10}
          stroke="#525252"
        />
        <Tooltip
          labelFormatter={(label) => day(label).format("YYYY-MM-DD")}
          contentStyle={{ backgroundColor: "#0a0a0a", borderColor: "#1a1a1a" }}
          itemStyle={{ color: "#e5e5e5" }}
        />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          onClick={handleLegendClick}
          payload={allHeroIds.map((heroId) => ({
            value: heroIdMap[heroId]?.name ?? `Hero ${heroId}`,
            type: "line",
            color: visibleHeroSet.has(heroId) ? (heroIdMap[heroId]?.color ?? "#ffffff") : "#555555",
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
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
