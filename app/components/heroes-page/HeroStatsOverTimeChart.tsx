import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { type Dayjs, day } from "~/dayjs";
import { type APIHeroStats, HERO_STATS, hero_stats_transform, TIME_INTERVALS } from "~/types/api_hero_stats";
import type { AssetsHero } from "~/types/assets_hero";

export function HeroStatSelector({
  value,
  onChange,
}: {
  value: (typeof HERO_STATS)[number];
  onChange: (val: (typeof HERO_STATS)[number]) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-[120px]">
        <SelectValue placeholder="Stat" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Stat</SelectLabel>
          {HERO_STATS.map((key) => (
            <SelectItem key={key as string} value={key as string}>
              {key}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function HeroTimeIntervalSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-[160px]">
        <SelectValue placeholder="Time Interval" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Time Interval</SelectLabel>
          {TIME_INTERVALS.map((key) => (
            <SelectItem key={key.label} value={key.query}>
              {key.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export default function HeroStatsOverTimeChart({
  heroIds,
  heroStat,
  heroTimeInterval,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
}: {
  heroIds?: number[];
  heroStat: (typeof HERO_STATS)[number];
  heroTimeInterval: string;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading: isLoadingHeroStats } = useQuery<APIHeroStats[]>({
    queryKey: ["api-hero-stats-over-time", minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, heroTimeInterval],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/hero-stats");
      if (heroTimeInterval) url.searchParams.set("bucket", heroTimeInterval);
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
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

  const { data: assetsHeroes, isLoading: isLoadingAssetsHeroes } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

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
    () => Math.min(...Object.keys(heroStatMap).map((d) => Number.parseInt(d))),
    [heroStatMap],
  );
  const maxDataDate = useMemo(
    () => Math.max(...Object.keys(heroStatMap).map((d) => Number.parseInt(d))),
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

  if (isLoadingHeroStats || isLoadingAssetsHeroes) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={800} className="p-4 bg-gray-800">
      <LineChart data={formattedData} margin={{ top: 20, bottom: 20 }}>
        <Legend layout="vertical" align="right" verticalAlign="top" />
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          type="number"
          scale="time"
          domain={[
            minDataDate ? day.unix(minDataDate).valueOf() : "auto",
            maxDataDate ? day.unix(maxDataDate).valueOf() : "auto",
          ]}
          tickFormatter={(timestamp) => day(timestamp).format("MM/DD/YY")}
          label={{ value: "Date", position: "insideBottom", offset: -15 }}
          stroke="#9ca3af"
        />
        <YAxis
          domain={[minStat * 0.9, maxStat * 1.1]}
          label={{ value: heroStat, angle: -90, position: "insideLeft" }}
          tickFormatter={(value) => Math.round(value).toLocaleString()}
          minTickGap={2}
          tickCount={10}
          stroke="#9ca3af"
        />
        <Tooltip
          labelFormatter={(label) => day(label).format("YYYY-MM-DD")}
          contentStyle={{ backgroundColor: "#1e293b", borderColor: "#4b5563" }}
          itemStyle={{ color: "#e5e7eb" }}
        />
        {(heroIds || []).map((heroId) => (
          <Line
            key={heroId}
            type="monotone"
            dataKey={heroId}
            stroke={heroIdMap[heroId]?.color || "#ffffff"}
            dot={false}
            activeDot={{ r: 6 }}
            strokeWidth={2}
            name={heroIdMap[heroId]?.name}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
