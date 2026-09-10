import { useQueries } from "@tanstack/react-query";
import type { AnalyticsApiHeroStatsRequest } from "deadlock_api_client";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { LOSS_COLOR, WIN_COLOR } from "~/components/tracker-page/shared/colors";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
import { DURATION_BUCKETS } from "~/lib/constants";
import { formatPercent } from "~/lib/format";
import { queryKeys } from "~/queries/query-keys";

const MIN_BUCKET_MATCHES = 100;

interface DurationEntry {
  label: string;
  /** Bracket start only, so seven ticks still fit on a phone-width axis. */
  tick: string;
  winRate: number;
  matches: number;
  /** Share of the hero's matches that ended in this duration bucket. */
  share: number;
}

export function HeroWinRateByDuration({
  heroId,
  heroName,
  request,
}: {
  heroId: number;
  heroName: string;
  request: Omit<AnalyticsApiHeroStatsRequest, "gameMode"> & { gameMode?: GameMode };
}) {
  const { rows, isPending } = useQueries({
    queries: DURATION_BUCKETS.map((bucket) => {
      const params = { ...request, minDurationS: bucket.minS, maxDurationS: bucket.maxS, bucket: "no_bucket" as const };
      return {
        queryKey: queryKeys.analytics.heroStatsByDuration(params),
        queryFn: async () => (await api.analytics_api.heroStats(params)).data,
        staleTime: CACHE_DURATIONS.ONE_DAY,
      };
    }),
    combine: (queries) => ({
      rows: queries.map((q) => q.data?.find((row) => row.hero_id === heroId)),
      isPending: queries.some((q) => q.isPending),
    }),
  });

  const entries = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + (row?.matches ?? 0), 0);
    return DURATION_BUCKETS.flatMap((bucket, i) => {
      const row = rows[i];
      if (!row || row.matches < MIN_BUCKET_MATCHES) return [];
      const entry: DurationEntry = {
        label: bucket.label,
        tick: i === 0 ? `<${bucket.maxS / 60}m` : `${bucket.minS / 60}m${i === DURATION_BUCKETS.length - 1 ? "+" : ""}`,
        winRate: row.wins / row.matches,
        matches: row.matches,
        share: row.matches / total,
      };
      return [entry];
    });
  }, [rows]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }
  if (entries.length < 2) return null;

  const early = entries[0];
  const late = entries[entries.length - 1];
  const delta = late.winRate - early.winRate;
  const verdict =
    Math.abs(delta) < 0.02
      ? `${heroName} wins about as often in short games as in long ones`
      : delta > 0
        ? `${heroName} scales into the late game`
        : `${heroName} falls off in longer games`;
  const winRateAxis = winRateDomain([0.5, ...entries.map((entry) => entry.winRate)]);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{heroName} Win Rate by Match Duration</h2>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{verdict}</span>: {formatPercent(early.winRate)} in{" "}
        {early.label} games versus {formatPercent(late.winRate)} in {late.label} games. Each bar is one duration bracket
        in the current patch; hover for how many of {heroName}&apos;s games end there.
      </p>
      <figure aria-label={`${heroName} win rate by match duration`}>
        <ResponsiveContainer width="100%" height={280} className="rounded-xl bg-muted p-2">
          <BarChart data={entries} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis dataKey="tick" interval={0} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis
              domain={winRateAxis}
              ticks={percentTicks(winRateAxis)}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              width={44}
              stroke="#525252"
              tick={{ fontSize: 11 }}
            />
            <ReferenceLine y={0.5} stroke="#525252" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0].payload as DurationEntry;
                return (
                  <div className="rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
                    <div className="font-medium">{entry.label}</div>
                    <div className="text-muted-foreground">
                      Win rate {formatPercent(entry.winRate)} · {formatPercent(entry.share, 0)} of games ·{" "}
                      {entry.matches.toLocaleString("en-US")} matches
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey={(entry: DurationEntry) => [0.5, entry.winRate]} radius={4}>
              {entries.map((entry) => (
                <Cell key={entry.tick} fill={entry.winRate >= 0.5 ? WIN_COLOR : LOSS_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </section>
  );
}
