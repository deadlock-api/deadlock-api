import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiPlayerPerformanceCurveRequest, PlayerPerformanceCurvePoint } from "deadlock_api_client";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem, ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_TICK,
  CHART_X_AXIS,
  CHART_X_LABEL,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
} from "~/components/patterns/charts/theme";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { TooltipCard, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

import { formatSouls, formatSoulsCompact, SOUL_SOURCE_GROUPS } from "./economy-definitions";

interface EconomyGrowthCurveProps {
  params: AnalyticsApiPlayerPerformanceCurveRequest;
}

type Mode = "total" | "by-source";

// Neutral bands: series hues are taken by the soul sources.
const PHASES = [
  { label: "Early", x1: 0, x2: 33, fillOpacity: 0 },
  { label: "Mid", x1: 33, x2: 66, fillOpacity: 0.03 },
  { label: "Late", x1: 66, x2: 100, fillOpacity: 0.06 },
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
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    playerPerformanceCurveQueryOptions({ ...params, resolution: 5 }),
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data
      .slice()
      .sort((a, b) => a.game_time - b.game_time)
      .map((point): CurvePoint => {
        const lower = Math.max(0, point.net_worth_avg - point.net_worth_std);
        const upper = point.net_worth_avg + point.net_worth_std;
        const curvePoint: CurvePoint = {
          t: point.game_time,
          avg: point.net_worth_avg,
          std: point.net_worth_std,
          lower,
          band: upper - lower,
        };
        for (const group of SOUL_SOURCE_GROUPS) {
          const fields = CURVE_FIELDS[group.key];
          const base = (point[fields.base] as number) ?? 0;
          const orb = fields.orb ? ((point[fields.orb] as number) ?? 0) : 0;
          curvePoint[group.key] = base + orb;
        }
        return curvePoint;
      });
  }, [data]);

  const phaseBands = PHASES.map((phase) => (
    <ReferenceArea
      key={phase.label}
      x1={phase.x1}
      x2={phase.x2}
      fill="var(--foreground)"
      fillOpacity={phase.fillOpacity}
      stroke="none"
      label={{ value: phase.label, position: "insideTop", ...CHART_TICK }}
    />
  ));
  const progressAxis = (
    <XAxis
      {...CHART_X_AXIS}
      dataKey="t"
      type="number"
      domain={[0, 100]}
      ticks={[0, 33, 66, 100]}
      tickFormatter={(v: number) => `${v}%`}
      label={{ ...CHART_X_LABEL, value: "Game Progress" }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        size="sm"
        width="hug"
        aria-label="Net worth breakdown"
        className="self-end"
        value={mode}
        onValueChange={setMode}
      >
        <SegmentedItem value="total">Total</SegmentedItem>
        <SegmentedItem value="by-source">By Source</SegmentedItem>
      </Segmented>

      <div aria-live="polite" aria-busy={isPending} className="flex flex-col gap-3">
        {isPending ? (
          <ChartLoading label="net worth growth" />
        ) : isError ? (
          <ChartError label="net worth growth" retrying={isFetching} onRetry={() => void refetch()} />
        ) : chartData.length === 0 ? (
          <ChartEmpty label="net worth growth" />
        ) : mode === "total" ? (
          <ChartSurface label="Net worth growth over the match" variant="bare">
            <ComposedChart data={chartData} margin={{ top: 24, right: 24, bottom: 8, left: 0 }}>
              {phaseBands}
              <CartesianGrid {...CHART_GRID} />
              {progressAxis}
              <YAxis
                {...CHART_Y_AXIS}
                tickFormatter={(v: number) => formatSoulsCompact(v)}
                label={{ ...CHART_Y_LABEL, value: "Avg Net Worth" }}
              />
              <Tooltip
                cursor={CHART_CURSOR_LINE}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof chartData)[number];
                  return (
                    <ChartReadings title={`${label}% into the match`}>
                      <ChartReading label="Net worth">{formatSouls(p.avg)}</ChartReading>
                      <ChartReading label="Std dev">± {formatSouls(p.std)}</ChartReading>
                    </ChartReadings>
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
          </ChartSurface>
        ) : (
          <ChartSurface label="Net worth by source over the match" variant="bare">
            <LineChart data={chartData} margin={{ top: 24, right: 24, bottom: 8, left: 0 }}>
              {phaseBands}
              <CartesianGrid {...CHART_GRID} />
              {progressAxis}
              <YAxis
                {...CHART_Y_AXIS}
                tickFormatter={(v: number) => formatSoulsCompact(v)}
                label={{ ...CHART_Y_LABEL, value: "Avg Souls" }}
              />
              <Tooltip
                cursor={CHART_CURSOR_LINE}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as (typeof chartData)[number];
                  return (
                    <TooltipCard>
                      <div className="text-xs font-semibold">{label}% into the match</div>
                      <TooltipStats>
                        {[...SOUL_SOURCE_GROUPS]
                          .sort((a, b) => row[b.key] - row[a.key])
                          .map((group) => (
                            <TooltipStat
                              key={group.key}
                              label={
                                <span className="flex items-center gap-1.5">
                                  <ChartSwatch color={group.color} shape="line" size="sm" />
                                  {group.label}
                                </span>
                              }
                              value={formatSouls(row[group.key])}
                            />
                          ))}
                      </TooltipStats>
                    </TooltipCard>
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
          </ChartSurface>
        )}

        {mode === "by-source" && (
          <ChartLegend className="justify-center">
            {SOUL_SOURCE_GROUPS.map((group) => (
              <ChartLegendItem key={group.key} color={group.color} shape="line">
                {group.label}
              </ChartLegendItem>
            ))}
          </ChartLegend>
        )}
      </div>
    </div>
  );
}
