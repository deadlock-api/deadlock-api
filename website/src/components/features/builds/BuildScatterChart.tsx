import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_COLOR,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_X_LABEL,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
} from "~/components/patterns/charts/theme";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import type { BuildRow } from "~/lib/build-stats";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
import { formatPercent, formatSignedPercent } from "~/lib/format";

const VERDICT_COLOR: Record<BuildRow["verdict"], string> = {
  above: CHART_COLOR.positive,
  below: CHART_COLOR.negative,
  even: CHART_COLOR.neutral,
};

const VERDICT_LABEL: Record<BuildRow["verdict"], string> = {
  above: "Above average",
  below: "Below average",
  even: "Within noise",
};

/** 1, 2 and 5 of every power of ten inside the domain: a log axis labelled at round numbers. */
function logTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let power = 10 ** Math.floor(Math.log10(min)); power <= max; power *= 10) {
    for (const step of [1, 2, 5]) {
      const tick = power * step;
      if (tick >= min && tick <= max) ticks.push(tick);
    }
  }
  return ticks;
}

const compact = (value: number) => value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });

interface Point {
  id: number;
  name: string;
  matches: number;
  winRate: number;
  row: BuildRow;
  selected: boolean;
}

function BuildDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={payload.selected ? 7 : 4.5}
      fill={VERDICT_COLOR[payload.row.verdict]}
      fillOpacity={payload.selected ? 1 : 0.75}
      stroke={payload.selected ? CHART_COLOR.ink : CHART_COLOR.surface}
      strokeWidth={payload.selected ? 2.5 : 1}
      // A dot is pressable: it selects its build.
      style={{ cursor: "pointer" }}
    />
  );
}

/**
 * Every build as one dot: how often it was played (log scale) against how it won, over the pooled win rate of all
 * builds. A dot is colored by whether its whole 95% interval clears that line. A press selects the build.
 */
export function BuildScatterChart({
  rows,
  average,
  selectedId,
  onBuildIdChange,
}: {
  rows: readonly BuildRow[];
  average: number;
  selectedId: number;
  onBuildIdChange: (buildId: number) => void;
}) {
  // The selected build is drawn last, so no other dot covers it.
  const points: Point[] = rows
    .map((row) => ({
      id: row.hero_build_id,
      name: row.meta?.name ?? `Build ${row.hero_build_id}`,
      matches: row.matches,
      winRate: row.winRate,
      row,
      selected: row.hero_build_id === selectedId,
    }))
    .sort((a, b) => Number(a.selected) - Number(b.selected));
  const minMatches = Math.min(...points.map((point) => point.matches));
  const maxMatches = Math.max(...points.map((point) => point.matches));
  const xDomain: [number, number] = [minMatches * 0.9, maxMatches * 1.1];
  const yDomain = winRateDomain([...points.map((point) => point.winRate), average]);
  const above = rows.filter((row) => row.verdict === "above").length;
  const below = rows.filter((row) => row.verdict === "below").length;

  return (
    <ChartCard
      title="Popularity vs. win rate"
      actions={
        <ChartLegend label="Dot colors">
          {(["above", "even", "below"] as const).map((verdict) => (
            <ChartLegendItem key={verdict} color={VERDICT_COLOR[verdict]} shape="dot">
              {VERDICT_LABEL[verdict]}
            </ChartLegendItem>
          ))}
          <ChartLegendItem color={CHART_COLOR.reference} shape="dashed">
            Average
          </ChartLegendItem>
        </ChartLegend>
      }
    >
      <ChartSurface
        variant="flush"
        size="default"
        announce="label"
        label={`${rows.length} builds by matches played and win rate: ${above} win confidently above the average of ${formatPercent(average)}, ${below} below it.`}
      >
        <ScatterChart margin={{ ...CHART_MARGIN, bottom: 16 }} accessibilityLayer={false}>
          <CartesianGrid {...CHART_GRID} vertical />
          <XAxis
            {...CHART_X_AXIS}
            type="number"
            dataKey="matches"
            name="Matches"
            scale="log"
            domain={xDomain}
            ticks={logTicks(xDomain[0], xDomain[1])}
            tickFormatter={compact}
            allowDataOverflow
            label={{ ...CHART_X_LABEL, value: "Matches (log scale)", offset: -8 }}
          />
          <YAxis
            {...CHART_Y_AXIS}
            type="number"
            dataKey="winRate"
            name="Win rate"
            domain={yDomain}
            ticks={percentTicks(yDomain)}
            tickFormatter={(value: number) => formatPercent(value, 0)}
            label={{ ...CHART_Y_LABEL, value: "Win rate" }}
          />
          <ReferenceLine y={average} {...CHART_BASELINE} ifOverflow="extendDomain" />
          <Tooltip
            isAnimationActive={false}
            cursor={false}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!point) return null;
              const { row } = point;
              return (
                <TooltipCard>
                  <TooltipHeader title={point.name} subtitle={VERDICT_LABEL[row.verdict]} />
                  <TooltipStats>
                    <TooltipStat label="Win rate" value={formatPercent(row.winRate)} />
                    <TooltipStat
                      label="95% interval"
                      value={`${formatPercent(row.interval[0])} – ${formatPercent(row.interval[1])}`}
                    />
                    <TooltipStat label="Vs. average" value={formatSignedPercent(row.vsAverage)} />
                    <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
                    <TooltipStat label="Players" value={row.players.toLocaleString("en-US")} />
                  </TooltipStats>
                </TooltipCard>
              );
            }}
          />
          <Scatter
            data={points}
            shape={<BuildDot />}
            isAnimationActive={false}
            onClick={(point: { payload?: Point }) => {
              if (point.payload) onBuildIdChange(point.payload.id);
            }}
          />
        </ScatterChart>
      </ChartSurface>
    </ChartCard>
  );
}
