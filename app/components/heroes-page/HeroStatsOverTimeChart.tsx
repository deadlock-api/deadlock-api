import { useQueries, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  type APIHeroStatsOverTime,
  HERO_STATS,
  TIME_INTERVALS,
  hero_stats_transform,
} from "~/types/api_hero_stats_over_time";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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

export function HeroTimeIntervalSelector({
  value,
  onChange,
}: {
  value: (typeof TIME_INTERVALS)[number];
  onChange: (val: (typeof TIME_INTERVALS)[number]) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-[160px]">
        <SelectValue placeholder="Time Interval" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Time Interval</SelectLabel>
          {TIME_INTERVALS.map((key) => (
            <SelectItem key={key as string} value={key as string}>
              {key}
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
  heroTimeInterval: (typeof TIME_INTERVALS)[number];
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs | null;
  maxDate?: Dayjs | null;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading: isLoadingHeroStats } = useQuery<APIHeroStatsOverTime[]>({
    queryKey: [
      "api-hero-stats-over-time",
      heroIds,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      heroTimeInterval,
    ],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/hero-stats/over-time");
      url.searchParams.set("hero_ids", heroIds?.join(",") || "");
      url.searchParams.set("time_interval", heroTimeInterval);
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
    for (const hero of heroData || []) {
      if (!map[hero.date_time]) map[hero.date_time] = [];
      map[hero.date_time].push([hero.hero_id, hero_stats_transform(hero, heroStat)]);
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

  const minStat = useMemo(
    () => Math.min(...Object.values(heroStatMap).map((q) => Math.min(...q.map(([, d]) => d)))),
    [heroStatMap],
  );
  const maxStat = useMemo(
    () => Math.max(...Object.values(heroStatMap).map((q) => Math.max(...q.map(([, d]) => d)))),
    [heroStatMap],
  );
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
      const dateObj = dayjs.unix(Number.parseInt(date, 10));
      const obj = {
        date: dateObj.toDate(),
      };
      for (const [heroId, stat] of stats) {
        Object.assign(obj, { [heroId]: stat });
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
            minDataDate ? dayjs.unix(minDataDate).valueOf() : "auto",
            maxDataDate ? dayjs.unix(maxDataDate).valueOf() : "auto",
          ]}
          tickFormatter={(timestamp) => dayjs(timestamp).format("MM/DD/YY")}
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
          labelFormatter={(label) => dayjs(label).format("YYYY-MM-DD")}
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
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
