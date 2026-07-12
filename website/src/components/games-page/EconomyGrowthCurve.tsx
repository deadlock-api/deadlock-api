import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiPlayerPerformanceCurveRequest, PlayerPerformanceCurvePoint } from "deadlock_api_client";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LoadingLogo } from "~/components/LoadingLogo";
import { cn } from "~/lib/utils";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

import { formatSouls, formatSoulsCompact, SOUL_SOURCE_GROUPS } from "./economy-definitions";

interface EconomyGrowthCurveProps {
  params: AnalyticsApiPlayerPerformanceCurveRequest;
}

type Mode = "total" | "by-source";

const PHASES = [
  { label: "Early", x1: 0, x2: 33, fill: "rgba(74,222,128,0.05)" },
  { label: "Mid", x1: 33, x2: 66, fill: "rgba(167,139,250,0.05)" },
  { label: "Late", x1: 66, x2: 100, fill: "rgba(251,113,133,0.06)" },
];

type CurveKey = keyof PlayerPerformanceCurvePoint;

interface CurvePoint {
  t: number;
  avg: number;
  std: number;
  lower: number;
  band: number;
  [source: string]: number;
}

const CURVE_FIELDS: Record<string, { base: CurveKey; orb?: CurveKey }> = {
  hero_kills: { base: "gold_player_avg", orb: "gold_player_orbs_avg" },
  lane_creeps: { base: "gold_lane_creep_avg", orb: "gold_lane_creep_orbs_avg" },
  jungle: { base: "gold_neutral_creep_avg", orb: "gold_neutral_creep_orbs_avg" },
  objectives: { base: "gold_boss_avg", orb: "gold_boss_orb_avg" },
  urn: { base: "gold_treasure_avg" },
};

export default function EconomyGrowthCurve({ params }: EconomyGrowthCurveProps) {
  const [mode, setMode] = useState<Mode>("total");
  const { data, isPending } = useQuery(playerPerformanceCurveQueryOptions({ ...params, resolution: 5 }));

  const chartData = useMemo(() => {
    if (!data) return [];
    return data
      .slice()
      .sort((a, b) => a.game_time - b.game_time)
      .map((point): CurvePoint => {
        const lower = Math.max(0, point.net_worth_avg - point.net_worth_std);
        const upper = point.net_worth_avg + point.net_worth_std;
        const sources: Record<string, number> = {};
        for (const group of SOUL_SOURCE_GROUPS) {
          const fields = CURVE_FIELDS[group.key];
          const base = (point[fields.base] as number) ?? 0;
          const orb = fields.orb ? ((point[fields.orb] as number) ?? 0) : 0;
          sources[group.key] = base + orb;
        }
        return {
          t: point.game_time,
          avg: point.net_worth_avg,
          std: point.net_worth_std,
          lower,
          band: upper - lower,
          ...sources,
        };
      });
  }, [data]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 self-end rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
        {(
          [
            { value: "total", label: "Total" },
            { value: "by-source", label: "By Source" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={cn(
              "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === opt.value
                ? "bg-white/[0.1] text-foreground"
                : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" aria-busy={isPending}>
        {isPending ? (
          <div className="flex items-center justify-center py-16">
            <LoadingLogo />
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data available.</div>
        ) : mode === "total" ? (
          <figure aria-label="Net worth growth over the match">
            <ResponsiveContainer width="100%" height={460} className="rounded-xl bg-muted p-4 [&_*]:outline-none">
              <ComposedChart data={chartData} margin={{ top: 24, right: 24, bottom: 36, left: 12 }}>
                {PHASES.map((phase) => (
                  <ReferenceArea
                    key={phase.label}
                    x1={phase.x1}
                    x2={phase.x2}
                    fill={phase.fill}
                    stroke="none"
                    label={{ value: phase.label, position: "insideTop", fill: "#737373", fontSize: 11 }}
                  />
                ))}
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 33, 66, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  stroke="#525252"
                  height={40}
                  label={{ value: "Game Progress", position: "insideBottom", offset: -6 }}
                />
                <YAxis
                  stroke="#525252"
                  tickFormatter={(v: number) => formatSoulsCompact(v)}
                  label={{ value: "Avg Net Worth", angle: -90, position: "insideLeft", offset: -2 }}
                />
                <Tooltip
                  labelFormatter={(label) => `${label}% into the match`}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                        <div className="mb-1 font-medium">{label}% into the match</div>
                        <div className="tabular-nums">
                          <span className="text-muted-foreground">Net worth: </span>
                          <span className="font-semibold">{formatSouls(p.avg)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">± {formatSouls(p.std)} std dev</div>
                      </div>
                    );
                  }}
                />
                <Area
                  dataKey="lower"
                  stackId="band"
                  stroke="none"
                  fill="transparent"
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Area
                  dataKey="band"
                  stackId="band"
                  stroke="none"
                  fill="var(--color-primary)"
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </figure>
        ) : (
          <figure aria-label="Net worth by source over the match">
            <ResponsiveContainer width="100%" height={460} className="rounded-xl bg-muted p-4 [&_*]:outline-none">
              <LineChart data={chartData} margin={{ top: 24, right: 24, bottom: 36, left: 12 }}>
                {PHASES.map((phase) => (
                  <ReferenceArea
                    key={phase.label}
                    x1={phase.x1}
                    x2={phase.x2}
                    fill={phase.fill}
                    stroke="none"
                    label={{ value: phase.label, position: "insideTop", fill: "#737373", fontSize: 11 }}
                  />
                ))}
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 33, 66, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  stroke="#525252"
                  height={40}
                  label={{ value: "Game Progress", position: "insideBottom", offset: -6 }}
                />
                <YAxis
                  stroke="#525252"
                  tickFormatter={(v: number) => formatSoulsCompact(v)}
                  label={{ value: "Avg Souls", angle: -90, position: "insideLeft", offset: -2 }}
                />
                <Tooltip
                  labelFormatter={(label) => `${label}% into the match`}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                        <div className="mb-1.5 font-medium">{label}% into the match</div>
                        <div className="flex flex-col gap-0.5">
                          {[...SOUL_SOURCE_GROUPS]
                            .sort((a, b) => (row[b.key] as number) - (row[a.key] as number))
                            .map((group) => (
                              <div key={group.key} className="flex items-center gap-2">
                                <span className="size-2.5 rounded-sm" style={{ backgroundColor: group.color }} />
                                <span className="flex-1">{group.label}</span>
                                <span className="tabular-nums">{formatSouls(row[group.key] as number)}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    );
                  }}
                />
                {SOUL_SOURCE_GROUPS.map((group) => (
                  <Line
                    key={group.key}
                    type="monotone"
                    dataKey={group.key}
                    name={group.label}
                    stroke={group.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </figure>
        )}

        {mode === "by-source" && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {SOUL_SOURCE_GROUPS.map((group) => (
              <div key={group.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: group.color }} />
                {group.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
