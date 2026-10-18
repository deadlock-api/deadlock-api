import { parseAsArrayOf, parseAsInteger, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { useItemPrices } from "~/components/features/builds/build-hooks";
import { ChartCard } from "~/components/patterns/charts/ChartCard";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_COLOR,
  CHART_GRID,
  CHART_MARGIN,
  CHART_TICK,
  CHART_X_AXIS,
  CHART_X_LABEL,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
} from "~/components/patterns/charts/theme";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { BUILD_METRICS, type BuildPerformanceTotals } from "~/lib/build-performance";
import { buildMatchesItems, type BuildRow, type BuildSlot, buildSlotCost } from "~/lib/build-stats";
import { niceTicks, percentTicks, winRateDomain } from "~/lib/chart-axis";
import { formatPercent, formatSignedPoints } from "~/lib/format";

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

/**
 * What the x axis can show: how often a build was played, one of its playstyle numbers, or the share of its items'
 * cost in one shop category.
 */
const X_OPTIONS = [
  { key: "matches", label: "Matches" },
  { key: "kda", label: "KDA" },
  { key: "soulsPerMin", label: "Souls/min" },
  { key: "damagePerMin", label: "Hero damage/min" },
  { key: "deaths", label: "Deaths" },
  { key: "weaponShare", label: "Weapon share" },
  { key: "spiritShare", label: "Spirit share" },
] as const;
const SHARE_SLOT: Partial<Record<(typeof X_OPTIONS)[number]["key"], BuildSlot>> = {
  weaponShare: "weapon",
  spiritShare: "spirit",
};
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
  /** Under the pointer in the list: drawn full and named like the selected one. */
  highlighted: boolean;
  /** Left out by the list's item filter: drawn faint. */
  dimmed: boolean;
  /** Where the selected dot's name goes: away from the nearer edge of the plot. */
  labelSide: "start" | "end";
}

/** A selected build's name longer than this is cut, so its label stays clear of the plot's far side. */
const LABEL_MAX_CHARS = 28;

function shortName(name: string): string {
  return name.length > LABEL_MAX_CHARS ? `${name.slice(0, LABEL_MAX_CHARS - 1).trimEnd()}…` : name;
}

function BuildDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const dot = (
    <circle
      cx={cx}
      cy={cy}
      r={payload.selected ? 7 : payload.highlighted ? 6 : 4.5}
      fill={VERDICT_COLOR[payload.row.verdict]}
      fillOpacity={payload.selected || payload.highlighted ? 1 : payload.dimmed ? 0.12 : 0.75}
      stroke={payload.selected || payload.highlighted ? CHART_COLOR.ink : CHART_COLOR.surface}
      strokeOpacity={payload.dimmed && !payload.selected && !payload.highlighted ? 0.3 : 1}
      strokeWidth={payload.selected ? 2.5 : payload.highlighted ? 1.5 : 1}
      // A dot is pressable: it selects its build.
      style={{ cursor: "pointer" }}
    />
  );
  if (!payload.selected && !payload.highlighted) return dot;
  // The selected build and the one under the pointer in the list are named on the plot, so the eye finds them.
  const toEnd = payload.labelSide === "end";
  return (
    <g>
      {dot}
      <text
        x={cx + (toEnd ? 12 : -12)}
        y={cy}
        dy="0.35em"
        textAnchor={toEnd ? "start" : "end"}
        fontSize={CHART_TICK.fontSize}
        fontWeight={600}
        fill={CHART_COLOR.ink}
        stroke={CHART_COLOR.surface}
        strokeWidth={4}
        paintOrder="stroke"
        pointerEvents="none"
      >
        {shortName(payload.name)}
      </text>
    </g>
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
  highlightedId = null,
  previewItemId = null,
  onBuildIdChange,
  onBuildHover,
  performance,
}: {
  rows: readonly BuildRow[];
  average: number;
  selectedId: number;
  /** The build the list's pointer is on, if any. */
  highlightedId?: number | null;
  /** An item the pointer is on elsewhere: builds that do not list it are drawn faint, as the item filter draws them. */
  previewItemId?: number | null;
  onBuildIdChange: (buildId: number) => void;
  /** The build whose dot the pointer is on, null when it leaves: the list marks its row. */
  onBuildHover?: (buildId: number | null) => void;
  /** Every build's performance totals, by id, for the playstyle axes; until they load only matches is offered. */
  performance?: Readonly<Record<number, BuildPerformanceTotals>>;
}) {
  const [chosenX, setX] = useQueryState("x", parseXKey);
  // The list's item filter, read from the same URL parameters: builds it leaves out are drawn faint here.
  const [itemParams] = useQueryStates({
    with_items: parseAsArrayOf(parseAsInteger).withDefault([]),
    without_items: parseAsArrayOf(parseAsInteger).withDefault([]),
  });
  const prices = useItemPrices();
  // The shares need only the builds' items; the playstyle axes wait for the performance numbers.
  const needsPerformance = (key: XKey) => key !== "matches" && !SHARE_SLOT[key];
  const xKey: XKey = performance || !needsPerformance(chosenX) ? chosenX : "matches";
  const shareSlot = SHARE_SLOT[xKey];
  const xMetric = BUILD_METRICS.find((metric) => metric.key === xKey);
  const xLabel = X_OPTIONS.find((option) => option.key === xKey)!.label;
  // Every axis but matches is linear.
  const linear = xKey !== "matches";
  const xFormat = shareSlot ? (value: number) => formatPercent(value, 0) : xMetric ? xMetric.format : compact;
  const xValue = (row: BuildRow): number | null => {
    if (shareSlot) {
      const cost = row.meta ? buildSlotCost(row.meta, prices) : null;
      return cost && cost.total > 0 ? cost.bySlot[shareSlot] / cost.total : null;
    }
    if (xMetric) {
      const totals = performance?.[row.hero_build_id];
      return totals ? xMetric.value(totals) : null;
    }
    return row.matches;
  };
  // The selected build is drawn last, so no other dot covers it. A hover never reorders the dots: the tooltip keeps the
  // index of the dot under the pointer, and a reorder would hand it another build.
  const rank = (point: Point) => (point.selected ? 1 : 0);
  const points: Point[] = rows
    .flatMap((row) => {
      const x = xValue(row);
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
      highlighted: row.hero_build_id === highlightedId,
      dimmed:
        !buildMatchesItems(row.meta, itemParams.with_items, itemParams.without_items) ||
        (previewItemId !== null && !buildMatchesItems(row.meta, [previewItemId], [])),
      labelSide: "end" as const,
    }))
    .sort((a, b) => rank(a) - rank(b));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const linearTicks = niceTicks(minX, maxX, 5);
  const xDomain: [number, number] = linear
    ? [linearTicks[0], linearTicks[linearTicks.length - 1]]
    : [minX * 0.9, maxX * 1.1];
  // The selected dot's name runs toward the plot's middle: left of a dot in the right half, right of one in the left.
  const position = (x: number) =>
    linear
      ? (x - xDomain[0]) / (xDomain[1] - xDomain[0])
      : Math.log(x / xDomain[0]) / Math.log(xDomain[1] / xDomain[0]);
  for (const point of points) point.labelSide = position(point.x) > 0.5 ? "start" : "end";
  const yDomain = winRateDomain([...points.map((point) => point.winRate), average]);
  const above = rows.filter((row) => row.verdict === "above").length;
  const below = rows.filter((row) => row.verdict === "below").length;

  return (
    <ChartCard
      title={`${linear ? xLabel : "Popularity"} vs. win rate`}
      actions={
        <>
          {/* Always there, its playstyle options disabled until their numbers load, so the header never changes height. */}
          <Select value={xKey} onValueChange={(value) => void setX(value as XKey)}>
            <SelectTrigger size="sm" aria-label="X axis" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {X_OPTIONS.map((option) => (
                <SelectItem key={option.key} value={option.key} disabled={!performance && needsPerformance(option.key)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
            scale={linear ? "linear" : "log"}
            domain={xDomain}
            ticks={linear ? linearTicks : logTicks(xDomain[0], xDomain[1])}
            tickFormatter={xFormat}
            allowDataOverflow
            label={{ ...CHART_X_LABEL, value: linear ? xLabel : "Matches (log scale)", offset: -8 }}
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
                  <TooltipHeader
                    title={point.name}
                    subtitle={
                      point.dimmed
                        ? `${VERDICT_LABEL[row.verdict]} · left out by the item filter`
                        : VERDICT_LABEL[row.verdict]
                    }
                  />
                  <TooltipStats>
                    <TooltipStat label="Win rate" value={formatPercent(row.winRate)} />
                    <TooltipStat
                      label="95% interval"
                      value={`${formatPercent(row.interval[0])} – ${formatPercent(row.interval[1])}`}
                    />
                    <TooltipStat label="Vs. average" value={formatSignedPoints(row.vsAverage)} />
                    {linear && <TooltipStat label={xLabel} value={xFormat(point.x)} />}
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
            onMouseEnter={(point: { payload?: Point }) => onBuildHover?.(point.payload?.id ?? null)}
            onMouseLeave={() => onBuildHover?.(null)}
          />
        </ScatterChart>
      </ChartSurface>
    </ChartCard>
  );
}
