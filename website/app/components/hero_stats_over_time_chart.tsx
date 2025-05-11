import { LineChart } from "@mui/x-charts";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo } from "react";
import {
  type APIHeroStatsOverTime,
  HERO_STATS,
  TIME_INTERVALS,
  hero_stats_transform,
} from "~/types/api_hero_stats_over_time";

import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

export function HeroStatSelector({
  value,
  onChange,
}: {
  value: (typeof HERO_STATS)[number];
  onChange: (val: (typeof HERO_STATS)[number]) => void;
}) {
  return (
    <FormControl size="medium" variant="outlined" sx={{ minWidth: 170, maxWidth: 200 }}>
      <InputLabel id="hero-stat-select-label" sx={{ color: "white" }}>
        Stat
      </InputLabel>
      <Select
        labelId="hero-stat-select-label"
        id="hero-stat-select"
        value={value}
        label="Stat"
        onChange={(e) => onChange(e.target.value as (typeof HERO_STATS)[number])}
        sx={{
          backgroundColor: "#1e293b",
          color: "#f1f5f9",
          borderRadius: 1,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#475569",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#334155",
          },
          "& .MuiSelect-icon": {
            color: "white",
          },
        }}
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
    <FormControl size="medium" variant="outlined" sx={{ minWidth: 170, maxWidth: 200 }}>
      <InputLabel id="hero-time-interval-select-label" sx={{ color: "white" }}>
        Time Interval
      </InputLabel>
      <Select
        labelId="hero-time-interval-select-label"
        id="hero-time-interval-select"
        value={value}
        label="Time Interval"
        onChange={(e) => onChange(e.target.value as (typeof TIME_INTERVALS)[number])}
        sx={{
          backgroundColor: "#1e293b",
          color: "#f1f5f9",
          borderRadius: 1,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#475569",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#334155",
          },
          "& .MuiSelect-icon": {
            color: "white",
          },
        }}
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
  heroId,
  heroStat,
  heroTimeInterval,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
}: {
  heroId: number;
  heroStat: (typeof HERO_STATS)[number];
  heroTimeInterval: (typeof TIME_INTERVALS)[number];
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs | null;
  maxDate?: Dayjs | null;
}) {
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: heroData, isLoading } = useQuery<APIHeroStatsOverTime[]>({
    queryKey: [
      "api-hero-stats-over-time",
      heroId,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      heroTimeInterval,
    ],
    queryFn: async () => {
      const url = new URL(`https://api.deadlock-api.com/v1/analytics/hero-stats/${heroId}/over-time`);
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

  const statData: [Dayjs, number][] = useMemo(
    () => heroData?.map((d) => [dayjs.unix(d.date_time), hero_stats_transform(d, heroStat)]) ?? [],
    [heroData, heroStat],
  );

  const minStat = useMemo(() => Math.min(...statData.map(([, d]) => d)), [statData]);
  const maxStat = useMemo(() => Math.max(...statData.map(([, d]) => d)), [statData]);

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
        hideLegend={true}
        sx={{
          backgroundColor: "#1e293b",
          color: "#fff",
        }}
        series={[
          {
            data: statData?.map(([, d]) => d) ?? [],
            label: `${heroStat}`,
            color: "#1976d2",
            area: true,
            showMark: false,
          },
        ]}
        xAxis={[
          {
            data: statData?.map(([d]) => d) ?? [],
            scaleType: "time",
            label: "Date",
            labelStyle: { fill: "#fff" },
            tickLabelStyle: { fill: "#fff" },
          },
        ]}
        yAxis={[
          {
            label: `${heroStat}`,
            min: minStat * 0.9,
            max: maxStat * 1.1,
            labelStyle: { fill: "#fff" },
            tickLabelStyle: { fill: "#fff" },
          },
        ]}
        grid={{ vertical: true, horizontal: true }}
      />
    </div>
  );
}
