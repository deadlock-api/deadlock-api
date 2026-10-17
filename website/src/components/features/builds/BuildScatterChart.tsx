import { parseAsStringLiteral, useQueryState } from "nuqs";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { BUILD_METRICS, type BuildPerformanceTotals } from "~/lib/build-performance";
import type { BuildRow } from "~/lib/build-stats";
import { niceTicks, percentTicks, winRateDomain } from "~/lib/chart-axis";
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

/** What the x axis can show: how often a build was played, or one of its playstyle numbers. */
const X_OPTIONS = [
  { key: "matches", label: "Matches" },
  { key: "kda", label: "KDA" },
  { key: "soulsPerMin", label: "Souls/min" },
  { key: "damagePerMin", label: "Hero damage/min" },
  { key: "deaths", label: "Deaths" },
] as const;
type XKey = (typeof X_OPTIONS)[number]["key"];
const parseXKey = parseAsStringLiteral(X_OPTIONS.map((option) => option.key))
  .withDefault("matches")
  .withOptions({ history: "replace" });

interface Point {
  id: number;
  name: string;
  /** The x value: matches, or the chosen playstyle number. */
  x: number;
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
  performance,
}: {
  rows: readonly BuildRow[];
  average: number;
  selectedId: number;
  onBuildIdChange: (buildId: number) => void;
  /** Every build's performance totals, by id, for the playstyle axes; until they load only matches is offered. */
  performance?: Readonly<Record<number, BuildPerformanceTotals>>;
}) {
  const [chosenX, setX] = useQueryState("x", parseXKey);
  const xKey: XKey = performance ? chosenX : "matches";
  const xMetric = xKey === "matches" ? undefined : BUILD_METRICS.find((metric) => metric.key === xKey);
  const xLabel = X_OPTIONS.find((option) => option.key === xKey)!.label;
  // The selected build is drawn last, so no other dot covers it.
  const points: Point[] = rows
    .flatMap((row) => {
      const totals = performance?.[row.hero_build_id];
      const x = xMetric ? (totals ? xMetric.value(totals) : null) : row.matches;
      return x === null ? [] : [{ row, x }];
    })
    .map(({ row, x }) => ({
      id: row.hero_build_id,
      name: row.meta?.name ?? `Build ${row.hero_build_id}`,
      x,
      matches: row.matches,
      winRate: row.winRate,
      row,
      selected: row.hero_build_id === selectedId,
    }))
    .sort((a, b) => Number(a.selected) - Number(b.selected));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const linearTicks = niceTicks(minX, maxX, 5);
  const xDomain: [number, number] = xMetric
    ? [linearTicks[0], linearTicks[linearTicks.length - 1]]
    : [minX * 0.9, maxX * 1.1];
  const yDomain = winRateDomain([...points.map((point) => point.winRate), average]);
  const above = rows.filter((row) => row.verdict === "above").length;
  const below = rows.filter((row) => row.verdict === "below").length;

  return (
    <ChartCard
      title={`${xMetric ? xLabel : "Popularity"} vs. win rate`}
      actions={
        <>
          {performance && (
            <Select value={xKey} onValueChange={(value) => void setX(value as XKey)}>
              <SelectTrigger size="sm" aria-label="X axis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {X_OPTIONS.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
        </>
      }
    >
      <ChartSurface
        variant="flush"
        size="default"
        announce="label"
        label={`${points.length} builds by ${xLabel.toLowerCase()} and win rate: ${above} win confidently above the average of ${formatPercent(average)}, ${below} below it.`}
      >
        <ScatterChart margin={{ ...CHART_MARGIN, bottom: 16 }} accessibilityLayer={false}>
          <CartesianGrid {...CHART_GRID} vertical />
          <XAxis
            {...CHART_X_AXIS}
            type="number"
            dataKey="x"
            name={xLabel}
            scale={xMetric ? "linear" : "log"}
            domain={xDomain}
            ticks={xMetric ? linearTicks : logTicks(xDomain[0], xDomain[1])}
            tickFormatter={xMetric ? (value: number) => xMetric.format(value) : compact}
            allowDataOverflow
            label={{ ...CHART_X_LABEL, value: xMetric ? xLabel : "Matches (log scale)", offset: -8 }}
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
                    {xMetric && <TooltipStat label={xLabel} value={xMetric.format(point.x)} />}
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
