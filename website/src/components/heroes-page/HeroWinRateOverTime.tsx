import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day } from "~/dayjs";
import { api } from "~/lib/api";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
import { getPickrateMultiplier } from "~/lib/constants";
import { formatPercent, formatSignedPercent } from "~/lib/format";
import { queryKeys } from "~/queries/query-keys";

const MIN_WEEK_MATCHES = 300;
const WIN_RATE_COLOR = "#f59e0b";
const PICK_RATE_COLOR = "#0284c7";

interface WeekEntry {
  weekStart: number;
  label: string;
  winRate: number;
  pickRate: number;
  matches: number;
}

export function HeroWinRateOverTime({
  heroId,
  heroName,
  request,
}: {
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
}) {
  const weeklyRequest = { ...request, bucket: "start_time_week" as const };
  const { data, isPending } = useQuery({
    queryKey: queryKeys.analytics.heroStatsOverTime(weeklyRequest),
    queryFn: async () => (await api.analytics_api.heroStats(weeklyRequest)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });

  const weeks = useMemo(() => {
    if (!data) return [];
    const hero = new Map<number, { wins: number; matches: number }>();
    const all = new Map<number, number>();
    for (const row of data) {
      all.set(row.bucket, (all.get(row.bucket) ?? 0) + row.matches);
      if (row.hero_id === heroId) hero.set(row.bucket, { wins: row.wins, matches: row.matches });
    }
    const multiplier = getPickrateMultiplier(request.gameMode);
    return [...hero.entries()]
      .filter(([, agg]) => agg.matches >= MIN_WEEK_MATCHES)
      .sort(([a], [b]) => a - b)
      .map(
        ([weekStart, agg]): WeekEntry => ({
          weekStart,
          label: day.unix(weekStart).format("MMM D"),
          winRate: agg.wins / agg.matches,
          pickRate: (multiplier * agg.matches) / (all.get(weekStart) ?? agg.matches),
          matches: agg.matches,
        }),
      );
  }, [data, heroId, request.gameMode]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }
  if (weeks.length < 2) return null;

  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const delta = last.winRate - first.winRate;
  const movement = Math.abs(delta) < 0.01 ? "has held steady" : delta > 0 ? "has climbed" : "has slipped";
  const winRateAxis = winRateDomain(weeks.map((week) => week.winRate));
  const pickRateAxis: [number, number] = [0, Math.ceil(Math.max(...weeks.map((week) => week.pickRate)) * 10) / 10];

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{heroName} Win Rate Over Time</h2>
      <p className="text-sm text-muted-foreground">
        {heroName}&apos;s win rate{" "}
        <span className="font-semibold text-foreground">
          {movement} ({formatSignedPercent(delta)})
        </span>{" "}
        from {formatPercent(first.winRate)} in the week of {first.label} to {formatPercent(last.winRate)} in the week of{" "}
        {last.label}. The solid line is win rate, the dashed line pick rate; both cover the current season week by week.
      </p>
      <figure aria-label={`${heroName} win rate and pick rate by week`}>
        <ResponsiveContainer width="100%" height={280} className="rounded-xl bg-muted p-2">
          <LineChart data={weeks} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="winRate"
              domain={winRateAxis}
              ticks={percentTicks(winRateAxis)}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              width={44}
              stroke="#525252"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              yAxisId="pickRate"
              orientation="right"
              domain={pickRateAxis}
              ticks={percentTicks(pickRateAxis)}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              width={44}
              stroke="#525252"
              tick={{ fontSize: 11 }}
            />
            <ReferenceLine yAxisId="winRate" y={0.5} stroke="#525252" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ stroke: "#525252" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0].payload as WeekEntry;
                return (
                  <div className="rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
                    <div className="font-medium">Week of {entry.label}</div>
                    <div className="text-muted-foreground">
                      Win rate {formatPercent(entry.winRate)} · Pick rate {formatPercent(entry.pickRate)} ·{" "}
                      {entry.matches.toLocaleString("en-US")} matches
                    </div>
                  </div>
                );
              }}
            />
            <Line
              yAxisId="winRate"
              type="monotone"
              dataKey="winRate"
              stroke={WIN_RATE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: WIN_RATE_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="pickRate"
              type="monotone"
              dataKey="pickRate"
              stroke={PICK_RATE_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </figure>
    </section>
  );
}
