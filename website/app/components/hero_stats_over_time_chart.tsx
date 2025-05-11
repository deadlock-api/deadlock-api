import { LineChart } from "@mui/x-charts";
import { useQueries, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo } from "react";
import {
  type APIHeroStatsOverTime,
  HERO_STATS,
  TIME_INTERVALS,
  hero_stats_transform,
} from "~/types/api_hero_stats_over_time";

import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import type { AssetsHero } from "~/types/assets_hero";

export function HeroStatSelector({
  value,
  onChange,
}: {
  value: (typeof HERO_STATS)[number];
  onChange: (val: (typeof HERO_STATS)[number]) => void;
}) {
  return (
    <FormControl size="medium" variant="outlined">
      <InputLabel id="hero-stat-select-label">Stat</InputLabel>
      <Select
        labelId="hero-stat-select-label"
        id="hero-stat-select"
        value={value}
        label="Stat"
        onChange={(e) => onChange(e.target.value as (typeof HERO_STATS)[number])}
      >
        {HERO_STATS.map((key) => (
          <MenuItem key={key as string} value={key}>
            {key}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
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
    <FormControl size="medium" variant="outlined" sx={{ minWidth: 160 }}>
      <InputLabel id="hero-time-interval-select-label">Time Interval</InputLabel>
      <Select
        labelId="hero-time-interval-select-label"
        id="hero-time-interval-select"
        value={value}
        label="Time Interval"
        onChange={(e) => onChange(e.target.value as (typeof TIME_INTERVALS)[number])}
      >
        {TIME_INTERVALS.map((key) => (
          <MenuItem key={key as string} value={key}>
            {key}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <LineChart
        height={700}
        sx={{ backgroundColor: "#1e293b" }}
        series={heroQueries.map((q, idx) => ({
          data: q.data.map(([, d]) => d),
          label: heroIdMap[(heroIds || [])[idx]].name,
          color: heroIdMap[(heroIds || [])[idx]].color,
          showMark: false,
        }))}
        xAxis={[
          {
            data: heroQueries[0]?.data.map(([d]) => d.toDate()) ?? [],
            scaleType: "time",
            label: "Date",
            min: minDataDate ? dayjs.unix(minDataDate).toDate() : undefined,
            max: maxDataDate ? dayjs.unix(maxDataDate).toDate() : undefined,
          },
        ]}
        yAxis={[
          {
            label: `${heroStat}`,
            min: minStat * 0.9,
            max: maxStat * 1.1,
          },
        ]}
        grid={{ vertical: true, horizontal: true }}
      />
    </div>
  );
}
