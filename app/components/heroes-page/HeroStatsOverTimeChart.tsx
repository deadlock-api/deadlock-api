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

  const heroQueries: { data: [Dayjs, number][]; isLoading: boolean }[] = useQueries({
    queries: (heroIds || []).map((id) => ({
      queryKey: [
        "api-hero-stats-over-time",
        id,
        minRankId,
        maxRankId,
        minDateTimestamp,
        maxDateTimestamp,
        heroTimeInterval,
      ],
      queryFn: async () => {
        const url = new URL(`https://api.deadlock-api.com/v1/analytics/hero-stats/${id}/over-time`);
        url.searchParams.set("time_interval", heroTimeInterval);
        url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
        url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
        if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
        if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
        const res = await fetch(url);
        return await res.json();
      },
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
    })),
  }).map((query) => ({
    data:
      query.data?.map((d: APIHeroStatsOverTime) => [dayjs.unix(d.date_time), hero_stats_transform(d, heroStat)]) ?? [],
    isLoading: query.isLoading,
  }));

  const { data: assetsHeroes, isLoading: isLoadingAssetsHeroes } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const isLoading = useMemo(
    () => isLoadingAssetsHeroes || heroQueries.some((q) => q.isLoading),
    [isLoadingAssetsHeroes, heroQueries],
  );

  const heroIdMap = useMemo(() => {
    const map: Record<number, { name: string; color: string }> = {};
    for (const hero of assetsHeroes || []) {
      map[hero.id] = { name: hero.name, color: `rgb(${hero.colors.ui.join(",")})` };
    }
    return map;
  }, [assetsHeroes]);

  const minStat = useMemo(
    () => Math.min(...heroQueries.map((q) => Math.min(...q.data.map(([, d]) => d))).filter(Boolean)),
    [heroQueries],
  );
  const maxStat = useMemo(
    () => Math.max(...heroQueries.map((q) => Math.max(...q.data.map(([, d]) => d))).filter(Boolean)),
    [heroQueries],
  );
  const minDataDate = useMemo(
    () => Math.min(...heroQueries.map((q) => Math.min(...q.data.map(([d]) => d.unix()))).filter(Boolean)),
    [heroQueries],
  );
  const maxDataDate = useMemo(
    () => Math.max(...heroQueries.map((q) => Math.max(...q.data.map(([d]) => d.unix()))).filter(Boolean)),
    [heroQueries],
  );

  const formattedData = useMemo(() => {
    if (!heroQueries.length || !heroQueries[0].data.length) return [];

    return heroQueries[0].data.map(([date], index) => {
      const dataPoint: { [key: string]: Date | number } = {
        date: date.toDate(),
      };

      // Add data for each hero
      heroQueries.forEach((query, heroIndex) => {
        const heroId = (heroIds || [])[heroIndex];
        const heroName = heroIdMap[heroId]?.name || `Hero ${heroId}`;
        if (query.data[index]) {
          dataPoint[heroName] = query.data[index][1];
          if (dataPoint[heroName] < 100) {
            dataPoint[heroName] = Math.round(dataPoint[heroName] * 100) / 100;
          } else {
            dataPoint[heroName] = Math.round(dataPoint[heroName]);
          }
        }
      });
      return dataPoint;
    });
  }, [heroQueries, heroIds, heroIdMap]);

  if (isLoading) {
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
            dataKey={heroIdMap[heroId]?.name || `Hero ${heroId}`}
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
