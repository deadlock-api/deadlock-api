import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiGameStatsRequest, PlayerPerformanceCurvePoint } from "deadlock_api_client";
import { Crosshair, HeartPulse, type LucideIcon, Swords } from "lucide-react";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { type ChartSize, ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_SPREAD_BAND,
  CHART_X_AXIS,
  CHART_X_LABEL,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
  SERIES_COLORS,
  CHART_ACTIVE_DOT,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { NoValue } from "~/components/ui/no-value";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { formatCompactAxisTick } from "~/lib/chart-axis";
import { formatStatValue } from "~/lib/stat-format";
import { cn } from "~/lib/utils";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

import { LAST_MINUTE, matchFilters, minuteLabel } from "./match-filters";
import { SpreadLegend } from "./SpreadLegend";

type CurveKey = keyof PlayerPerformanceCurvePoint;

const formatValue = (value: number, digits: number) =>
  digits === 0 ? formatStatValue(value, "integer") : value.toFixed(digits);

/** Damage by target, in the colors the soul sources of the same targets have on the economy tab. */
const DAMAGE_TARGETS = [
  { key: "heroes", label: "Heroes", field: "player_damage_avg", color: SERIES_COLORS[0] },
  { key: "objectives", label: "Objectives", field: "boss_damage_avg", color: SERIES_COLORS[3] },
  { key: "jungle", label: "Jungle", field: "neutral_damage_avg", color: SERIES_COLORS[2] },
  { key: "laneCreeps", label: "Lane creeps", field: "creep_damage_avg", color: SERIES_COLORS[1] },
] as const satisfies { key: string; label: string; field: CurveKey; color: string }[];

/** Fields every curve point has (the buff counts can be null). */
type NumberKey = { [K in CurveKey]: PlayerPerformanceCurvePoint[K] extends number ? K : never }[CurveKey];

interface CurveMetric {
  label: string;
  reading: string;
  avg: NumberKey;
  std: NumberKey;
  digits: number;
}

const KILL_TARGETS = {
  heroes: { label: "Heroes", reading: "Hero kills", avg: "kills_avg", std: "kills_std", digits: 1 },
  objectives: {
    label: "Objectives",
    reading: "Objectives killed",
    avg: "boss_kills_avg",
    std: "boss_kills_std",
    digits: 2,
  },
  jungle: {
    label: "Jungle",
    reading: "Jungle creeps killed",
    avg: "neutral_kills_avg",
    std: "neutral_kills_std",
    digits: 1,
  },
  laneCreeps: { label: "Lane creeps", reading: "Last hits", avg: "creep_kills_avg", std: "creep_kills_std", digits: 1 },
  denies: { label: "Denies", reading: "Denies", avg: "denies_avg", std: "denies_std", digits: 1 },
} as const satisfies Record<string, CurveMetric>;

/** Healing and barriers one player has given (self included), and the damage they have dealt to themselves. */
const SUSTAIN_METRICS = {
  healing: {
    label: "Healing",
    reading: "Healing",
    avg: "player_healing_avg",
    std: "player_healing_std",
    digits: 0,
  },
  barriers: {
    label: "Barriers",
    reading: "Barriers",
    avg: "player_barriering_avg",
    std: "player_barriering_std",
    digits: 0,
  },
  selfDamage: {
    label: "Self damage",
    reading: "Self damage",
    avg: "self_damage_avg",
    std: "self_damage_std",
    digits: 0,
  },
} as const satisfies Record<string, CurveMetric>;

interface CombatTabProps {
  params: AnalyticsApiGameStatsRequest;
}

/** Damage and kills by game minute, per target, from the performance curve on the page's filters. */
export default function CombatTab({ params }: CombatTabProps) {
  const query = useQuery(
    playerPerformanceCurveQueryOptions({
      // Absolute game time (3, 6, 9 … minutes) rather than shares of the match; the buffs tab reads the same curve.
      resolution: 0,
      ...matchFilters(params),
    }),
  );
  const points = (query.data ?? [])
    .filter((point) => point.game_time <= LAST_MINUTE * 60)
    .sort((a, b) => a.game_time - b.game_time);

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
      <Panel className="h-full">
        <PanelHeader title="Damage Dealt" icon={Swords} />
        <PanelBody className="flex flex-1 flex-col gap-3">
          <DamageCurve points={points} query={query} />
        </PanelBody>
      </Panel>
      <SpreadPanel
        title="Kills by Target"
        icon={Crosshair}
        metrics={KILL_TARGETS}
        initial="heroes"
        label="kills over the match"
        pickerLabel="Kill target"
        points={points}
        query={query}
      />
      <SpreadPanel
        title="Healing & Self Damage"
        icon={HeartPulse}
        className="lg:col-span-2"
        // Alone in its row: the plot keeps the default height, which steps up on a wide panel.
        size="default"
        metrics={SUSTAIN_METRICS}
        initial="healing"
        label="healing over the match"
        pickerLabel="Sustain metric"
        points={points}
        query={query}
      />
    </div>
  );
}

interface CurveProps {
  points: PlayerPerformanceCurvePoint[];
  query: { isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };
}

/** The damage targets' key, shown in every state, so the panel keeps its height while the chart loads. */
function DamageLegend() {
  return (
    <ChartLegend label="Damage targets">
      {DAMAGE_TARGETS.map((target) => (
        <ChartLegendItem key={target.key} color={target.color} shape="line">
          {target.label}
        </ChartLegendItem>
      ))}
    </ChartLegend>
  );
}

function DamageCurve({ points, query }: CurveProps) {
  const label = "damage over the match";
  const state = query.isPending ? (
    <ChartLoading label={label} size="stretch" />
  ) : query.isError ? (
    <ChartError label={label} retrying={query.isFetching} onRetry={() => void query.refetch()} />
  ) : points.length === 0 ? (
    <ChartEmpty label={label} />
  ) : null;
  if (state) {
    return (
      <>
        {state}
        <DamageLegend />
      </>
    );
  }

  const last = points.at(-1);
  const summary = `Average damage dealt by game minute, per target.${
    last
      ? ` At ${minuteLabel(last.game_time)}: ${DAMAGE_TARGETS.flatMap((target) => {
          const value = formatStatValue(last[target.field], "integer");
          return value == null ? [] : [`${target.label} ${value}`];
        }).join(", ")}.`
      : ""
  }`;

  return (
    <>
      <ChartSurface label={summary} size="stretch" variant="bare">
        <LineChart data={points} margin={{ ...CHART_MARGIN, top: 16, right: 16 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            {...CHART_X_AXIS}
            dataKey="game_time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={minuteLabel}
            label={{ ...CHART_X_LABEL, value: "Game Time" }}
          />
          <YAxis
            {...CHART_Y_AXIS}
            tickFormatter={(value: number) => formatCompactAxisTick(value, 1000)}
            label={{ ...CHART_Y_LABEL, value: "Avg Damage" }}
          />
          <Tooltip
            cursor={CHART_CURSOR_LINE}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as PlayerPerformanceCurvePoint | undefined;
              if (!active || !point) return null;
              return (
                <ChartReadings title={`At ${minuteLabel(point.game_time)}`} valueLabel="Damage">
                  {DAMAGE_TARGETS.map((target) => (
                    <ChartReading key={target.key} label={target.label} color={target.color}>
                      {formatStatValue(point[target.field], "integer") ?? <NoValue />}
                    </ChartReading>
                  ))}
                </ChartReadings>
              );
            }}
          />
          {DAMAGE_TARGETS.map((target) => (
            <Line
              key={target.key}
              name={target.label}
              type="monotone"
              dataKey={target.field}
              stroke={target.color}
              strokeWidth={2}
              dot={false}
              activeDot={CHART_ACTIVE_DOT}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartSurface>
      <DamageLegend />
    </>
  );
}

interface SpreadPanelProps<K extends string> extends CurveProps {
  title: string;
  icon: LucideIcon;
  className?: string;
  /** `stretch` beside another panel, so the two x-axes stay level. */
  size?: ChartSize;
  metrics: Record<K, CurveMetric>;
  initial: K;
  /** What the chart shows, for its loading, empty and error states. */
  label: string;
  /** Accessible name of the metric picker. */
  pickerLabel: string;
}

/**
 * A panel of one metric by game minute, picked in the header, so its plot starts where the plot of the panel beside
 * it does.
 */
function SpreadPanel<K extends string>({
  title,
  icon,
  className,
  size = "stretch",
  metrics,
  initial,
  label,
  pickerLabel,
  points,
  query,
}: SpreadPanelProps<K>) {
  const [metric, setMetric] = useState<K>(initial);
  return (
    <Panel className={cn("h-full", className)}>
      <PanelHeader title={title} icon={icon}>
        <Segmented size="sm" width="hug" aria-label={pickerLabel} value={metric} onValueChange={setMetric}>
          {(Object.keys(metrics) as K[]).map((key) => (
            <SegmentedItem key={key} value={key}>
              {metrics[key].label}
            </SegmentedItem>
          ))}
        </Segmented>
      </PanelHeader>
      <PanelBody className="flex flex-1 flex-col gap-3">
        <SpreadCurve selected={metrics[metric]} label={label} size={size} points={points} query={query} />
      </PanelBody>
    </Panel>
  );
}

/** One metric by game minute, with the spread between players shaded. */
function SpreadCurve({
  selected,
  label,
  size,
  points,
  query,
}: CurveProps & { selected: CurveMetric; label: string; size: ChartSize }) {
  const rows = points.map((point) => {
    const value = point[selected.avg];
    const std = point[selected.std];
    return { time: point.game_time, value, std, band: [Math.max(0, value - std), value + std] };
  });
  const last = rows.at(-1);

  return (
    <>
      {query.isPending ? (
        <ChartLoading label={label} size={size} />
      ) : query.isError ? (
        <ChartError label={label} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <ChartEmpty label={label} />
      ) : (
        <ChartSurface
          label={`${selected.reading} by game minute, with the spread between players.${
            last && formatValue(last.value, selected.digits) != null
              ? ` At ${minuteLabel(last.time)}: ${formatValue(last.value, selected.digits)}.`
              : ""
          }`}
          size={size}
          variant="bare"
        >
          <ComposedChart data={rows} margin={{ ...CHART_MARGIN, top: 16, right: 16 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              {...CHART_X_AXIS}
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={minuteLabel}
              label={{ ...CHART_X_LABEL, value: "Game Time" }}
            />
            <YAxis
              {...CHART_Y_AXIS}
              tickFormatter={selected.digits === 0 ? (value: number) => formatCompactAxisTick(value, 1000) : undefined}
              label={{ ...CHART_Y_LABEL, value: `Avg ${selected.label}` }}
            />
            <Tooltip
              cursor={CHART_CURSOR_LINE}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <ChartReadings title={`At ${minuteLabel(row.time)}`}>
                    <ChartReading label={selected.reading}>
                      {formatValue(row.value, selected.digits) ?? <NoValue label="No data" />}
                    </ChartReading>
                    <ChartReading label="Std dev">
                      {formatValue(row.std, selected.digits) == null ? (
                        <NoValue label="No data" />
                      ) : (
                        `± ${formatValue(row.std, selected.digits)}`
                      )}
                    </ChartReading>
                  </ChartReadings>
                );
              }}
            />
            <Area type="monotone" dataKey="band" fill={CHART_COLOR.primary} {...CHART_SPREAD_BAND} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLOR.primary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartSurface>
      )}
      <SpreadLegend label={label} average={`Avg ${selected.reading.toLowerCase()}`} />
    </>
  );
}
