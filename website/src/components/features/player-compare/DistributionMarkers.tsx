import type { HashMapValue } from "deadlock_api_client";
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartReading, ChartReadingList } from "~/components/patterns/charts/ChartReadings";
import { ChartReveal, ChartRevealBack, ChartRevealFront } from "~/components/patterns/charts/ChartReveal";
import { ChartEmpty, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { chartSizeVariants, ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_AREA_NEUTRAL,
  CHART_CUSTOM_TICK_DY,
  CHART_MARGIN_SM,
  CHART_MEDIAN_LINE,
  CHART_TICK,
  CHART_X_AXIS_CUSTOM_TICK,
  CHART_COLOR,
} from "~/components/patterns/charts/theme";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { Grid } from "~/components/ui/grid";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { approxPercentile, buildDistributionCurve } from "~/lib/distribution-percentile";
import type { GameMode } from "~/lib/game-mode";
import { LOWER_IS_BETTER_METRICS, rankShareLabel } from "~/lib/player-compare";
import { formatPlayerMetricValue, PLAYER_METRICS, playerMetricsFor } from "~/lib/player-metrics";

import type { ComparedPlayer } from "./types";

/** Every stat the API reports: the ones a player is most often measured by first, then the rest in category order. */
const LEAD_KEYS = [
  "kda",
  "kills",
  "deaths",
  "assists",
  "net_worth_per_min",
  "player_damage_per_min",
  "accuracy",
  "last_hits",
  "crit_shot_rate",
  "boss_damage_per_min",
];
/**
 * The head-to-head's names for the same stats, so one stat reads the same across the page. These are averages of each
 * match, which the per-match units say; the KDA especially is the average of the match KDAs, not the table's pooled
 * (kills + assists) / deaths, so it gets its own name.
 */
const COMPARE_LABELS: Record<string, string> = {
  kills: "Kills / match",
  deaths: "Deaths / match",
  assists: "Assists / match",
  kda: "Avg match KDA",
  kd: "Avg match K/D",
  net_worth: "Souls / match",
  net_worth_per_min: "Souls / min",
  player_damage: "Hero damage / match",
  player_damage_per_min: "Hero damage / min",
  crit_shot_rate: "Headshot rate",
  last_hits: "Last hits / match",
  denies: "Denies / match",
  boss_damage: "Obj. damage / match",
  boss_damage_per_min: "Obj. damage / min",
  heal_prevented: "Heal prevented / match",
};

const METRICS = [
  ...LEAD_KEYS.flatMap((key) => PLAYER_METRICS.filter((metric) => metric.key === key)),
  ...PLAYER_METRICS.filter((metric) => !LEAD_KEYS.includes(metric.key)),
].map((metric) => ({ ...metric, label: COMPARE_LABELS[metric.key] ?? metric.label }));

/** The stats with a curve in one game mode: Street Brawl has no souls to rank players on. */
export function distributionMetricsFor(gameMode: GameMode) {
  return playerMetricsFor(METRICS, gameMode);
}
/** How many stats a collapsed panel shows when it is one column wide. */
const NARROW_METRICS = 6;

/** One stat's chart, on its own so a tile only redraws when its own values change. */
function MetricTile({
  metric,
  values,
  players,
  averages,
  loading,
  zoom,
  className,
}: {
  metric: (typeof METRICS)[number];
  values: HashMapValue | undefined;
  players: ComparedPlayer[];
  averages: (Record<string, HashMapValue> | undefined)[];
  loading: boolean;
  zoom: boolean;
  /** Layout from the parent. */
  className?: string;
}) {
  const fmt = (value: number) => formatPlayerMetricValue(value, metric.format);
  const marks = players.flatMap((player, index) => {
    const avg = averages[index]?.[metric.key]?.avg;
    return avg == null || !Number.isFinite(avg) ? [] : [{ player, avg }];
  });
  return (
    <Stack gap={1} className={className}>
      <Text variant="label">{metric.label}</Text>
      {loading ? (
        <ChartLoading label={`${metric.label} distribution`} size="sm" />
      ) : !values ? (
        <ChartEmpty label={`${metric.label} data`} className={chartSizeVariants({ size: "sm" })} />
      ) : (
        <MetricCurve zoom={zoom} metricKey={metric.key} label={metric.label} values={values} marks={marks} fmt={fmt} />
      )}
    </Stack>
  );
}

/**
 * Small multiples of the population's distribution for every stat, each player's average a line on it in the
 * player's color. Hovering or focusing a chart turns it into a table of every player's value and share.
 */
export function DistributionMarkers({
  players,
  gameMode,
  population,
  averages,
  loading,
  zoom = true,
  limit,
}: {
  players: ComparedPlayer[];
  /** Street Brawl leaves out the souls curves. */
  gameMode: GameMode;
  population: Record<string, HashMapValue> | undefined;
  /** Each player's own metrics, in the players' order. */
  averages: (Record<string, HashMapValue> | undefined)[];
  loading: boolean;
  /** On: each curve spans the players, with a margin. Off: the whole field, from its lowest to its highest. */
  zoom?: boolean;
  /** Shows only the first stats, the ones a player is most often measured by. */
  limit?: number;
}) {
  return (
    <PanelBody size="sm">
      <Grid columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }} gap={3}>
        {distributionMetricsFor(gameMode)
          .slice(0, limit)
          .map((metric, index) => (
            <MetricTile
              key={metric.key}
              // Collapsed on a phone (one column), the first six; "Show all" opens the rest.
              className={limit !== undefined && index >= NARROW_METRICS ? "hidden @sm/percentiles:flex" : undefined}
              metric={metric}
              values={population?.[metric.key]}
              players={players}
              averages={averages}
              loading={loading}
              zoom={zoom}
            />
          ))}
      </Grid>
    </PanelBody>
  );
}

/**
 * The x range the players occupy, with a margin: at least a quarter of the middle half of the field on each side,
 * so a close race still shows the curve around it. Kept within the known range of the curve.
 */
function zoomDomain(avgs: number[], values: HashMapValue, min: number, max: number): [number, number] {
  if (avgs.length === 0) return [min, max];
  const lo = Math.min(...avgs);
  const hi = Math.max(...avgs);
  const iqr = values.percentile75 - values.percentile25;
  const pad = Math.max((hi - lo) * 0.35, iqr * 0.25, (max - min) * 0.05);
  return [Math.max(min, lo - pad), Math.min(max, hi + pad)];
}

function MetricCurve({
  zoom,
  metricKey,
  label,
  values,
  marks,
  fmt,
}: {
  zoom: boolean;
  metricKey: string;
  label: string;
  values: HashMapValue;
  marks: { player: ComparedPlayer; avg: number }[];
  fmt: (value: number) => string;
}) {
  const lowerIsBetter = LOWER_IS_BETTER_METRICS.has(metricKey);
  const curve = buildDistributionCurve(values);
  const min = curve[0]?.x ?? 0;
  const max = curve[curve.length - 1]?.x ?? 1;
  const [from, to] = zoom
    ? zoomDomain(
        marks.map((mark) => mark.avg),
        values,
        min,
        max,
      )
    : [min, max];
  // The height of the part in view, so a zoomed-in slope is not drawn flat under the peak outside it.
  const visibleMax = Math.max(
    ...curve
      .filter((point, index) => {
        const next = curve[index + 1];
        const prev = curve[index - 1];
        return (
          (point.x >= from && point.x <= to) ||
          (next && next.x > from && point.x < from) ||
          (prev && prev.x < to && point.x > to)
        );
      })
      .map((point) => point.y),
    0,
  );
  // A player past the known ends of the curve is drawn on the edge rather than off the plot.
  const clamp = (x: number) => Math.min(to, Math.max(from, x));
  const share = (avg: number) => rankShareLabel(approxPercentile(values, avg), lowerIsBetter);
  // Two ticks, always: both ends of the zoom, each named by where it ranks; a middle one left no room for legible text.
  const edge = (x: number) => ({ x, label: rankShareLabel(approxPercentile(values, x), lowerIsBetter) });
  const landmarks = from === to ? [edge(from)] : [edge(from), edge(to)];
  const tickLabel = new Map(landmarks.map((landmark) => [landmark.x, landmark.label]));
  const summary =
    `${label}: median of all players ${fmt(values.percentile50)}. ` +
    marks.map(({ player, avg }) => `${player.name} ${fmt(avg)}, ${share(avg)} of players`).join("; ");

  return (
    <ChartReveal aria-label={`${label}: where each player ranks`}>
      <ChartRevealFront>
        <ChartSurface label={summary} announce="label" size="sm" variant="bare">
          <AreaChart data={curve} margin={CHART_MARGIN_SM} accessibilityLayer={false}>
            <XAxis
              type="number"
              dataKey="x"
              domain={[from, to]}
              allowDataOverflow
              // Better is always to the right: a stat where less is better (deaths) runs from high to low.
              reversed={lowerIsBetter}
              ticks={landmarks.map((landmark) => landmark.x)}
              interval={0}
              // The outer labels align inward, so a label on the plot's edge is not cut in half.
              {...CHART_X_AXIS_CUSTOM_TICK}
              tick={({
                x,
                y,
                payload,
                index,
              }: {
                x: number | string;
                y: number | string;
                payload: { value: number };
                index: number;
              }) => (
                <text
                  x={x}
                  y={y}
                  dy={CHART_CUSTOM_TICK_DY}
                  // The label at the plot's left edge starts there, the one at its right edge ends there.
                  textAnchor={
                    index === (lowerIsBetter ? landmarks.length - 1 : 0)
                      ? "start"
                      : index === (lowerIsBetter ? 0 : landmarks.length - 1)
                        ? "end"
                        : "middle"
                  }
                  style={CHART_TICK}
                >
                  {tickLabel.get(payload.value) ?? ""}
                </text>
              )}
            />
            <YAxis type="number" domain={[0, visibleMax * 1.1 || "dataMax"]} allowDataOverflow hide />
            <Area type="monotone" dataKey="y" {...CHART_AREA_NEUTRAL} isAnimationActive={false} />
            <ReferenceLine x={values.percentile50} {...CHART_MEDIAN_LINE} />
            {marks.map(({ player, avg }) => (
              <ReferenceLine key={player.accountId} x={clamp(avg)} stroke={player.color} strokeWidth={2} />
            ))}
          </AreaChart>
        </ChartSurface>
      </ChartRevealFront>
      <ChartRevealBack>
        {/* The readings stay inside the plot's box: four or more players close up the rows, and five leave the median
            to its dashed line on the plot. */}
        <ChartReadingList extra className={marks.length >= 4 ? "gap-0" : undefined}>
          {marks.map(({ player, avg }) => (
            <ChartReading key={player.accountId} label={player.name} color={player.color} extra={fmt(avg)}>
              {share(avg)}
            </ChartReading>
          ))}
          {marks.length < 5 && (
            <ChartReading label="Median player" color={CHART_COLOR.reference} extra={fmt(values.percentile50)}>
              Median
            </ChartReading>
          )}
        </ChartReadingList>
      </ChartRevealBack>
    </ChartReveal>
  );
}
