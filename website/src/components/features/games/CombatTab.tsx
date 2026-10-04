import { useQuery } from "@tanstack/react-query";
import type {
  AnalyticsApiGameStatsRequest,
  AnalyticsApiPlayerPerformanceCurveRequest,
  PlayerPerformanceCurvePoint,
} from "deadlock_api_client";
import { Crosshair, Swords } from "lucide-react";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
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
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { formatCompactAxisTick } from "~/lib/chart-axis";
import { formatStatValue } from "~/lib/stat-format";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

/** Past this few matches are left, so the curves swing (as on the buffs tab and the player comparison's timeline). */
const LAST_MINUTE = 45;

const minuteLabel = (seconds: number) => `${Math.round(seconds / 60)}m`;

type CurveKey = keyof PlayerPerformanceCurvePoint;

/** Damage by target, in the colors the soul sources of the same targets have on the economy tab. */
const DAMAGE_TARGETS = [
  { key: "heroes", label: "Heroes", field: "player_damage_avg", color: SERIES_COLORS[0] },
  { key: "objectives", label: "Objectives", field: "boss_damage_avg", color: SERIES_COLORS[3] },
  { key: "jungle", label: "Jungle", field: "neutral_damage_avg", color: SERIES_COLORS[2] },
  { key: "laneCreeps", label: "Lane creeps", field: "creep_damage_avg", color: SERIES_COLORS[1] },
] as const satisfies { key: string; label: string; field: CurveKey; color: string }[];

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
} as const satisfies Record<string, { label: string; reading: string; avg: CurveKey; std: CurveKey; digits: number }>;
type KillTarget = keyof typeof KILL_TARGETS;

interface CombatTabProps {
  params: AnalyticsApiGameStatsRequest;
}

/** Damage and kills by game minute, per target, from the performance curve on the page's filters. */
export default function CombatTab({ params }: CombatTabProps) {
  const curveParams: AnalyticsApiPlayerPerformanceCurveRequest = {
    // Absolute game time (3, 6, 9 … minutes) rather than shares of the match; the buffs tab reads the same curve.
    resolution: 0,
    gameMode: params.gameMode,
    matchMode: params.matchMode,
    minUnixTimestamp: params.minUnixTimestamp,
    maxUnixTimestamp: params.maxUnixTimestamp,
    minDurationS: params.minDurationS,
    maxDurationS: params.maxDurationS,
    minAverageBadge: params.minAverageBadge,
    maxAverageBadge: params.maxAverageBadge,
  };
  const query = useQuery(playerPerformanceCurveQueryOptions(curveParams));
  const points = (query.data ?? [])
    .filter((point) => point.game_time <= LAST_MINUTE * 60)
    .sort((a, b) => a.game_time - b.game_time);

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
      <Panel className="h-full">
        <PanelHeader
          title="Damage Dealt"
          icon={Swords}
          description="Average damage one player has dealt by each game minute"
        />
        <PanelBody className="flex flex-1 flex-col gap-3">
          <DamageCurve points={points} query={query} />
        </PanelBody>
      </Panel>
      <Panel className="h-full">
        <PanelHeader
          title="Kills by Target"
          icon={Crosshair}
          description="Average kills one player has by each game minute"
        />
        <PanelBody className="flex flex-1 flex-col gap-3">
          <KillCurve points={points} query={query} />
        </PanelBody>
      </Panel>
    </div>
  );
}

interface CurveProps {
  points: PlayerPerformanceCurvePoint[];
  query: { isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown };
}

function DamageCurve({ points, query }: CurveProps) {
  const label = "damage over the match";
  if (query.isPending) return <ChartLoading label={label} />;
  if (query.isError)
    return <ChartError label={label} retrying={query.isFetching} onRetry={() => void query.refetch()} />;
  if (points.length === 0) return <ChartEmpty label={label} />;

  const last = points.at(-1);
  const summary = `Average damage dealt by game minute, per target.${
    last
      ? ` At ${minuteLabel(last.game_time)}: ${DAMAGE_TARGETS.map(
          (target) => `${target.label} ${formatStatValue(last[target.field], "integer")}`,
        ).join(", ")}.`
      : ""
  }`;

  return (
    <>
      <ChartSurface label={summary} variant="bare">
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
                      {formatStatValue(point[target.field], "integer")}
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
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartSurface>
      <ChartLegend label="Damage targets">
        {DAMAGE_TARGETS.map((target) => (
          <ChartLegendItem key={target.key} color={target.color} shape="line">
            {target.label}
          </ChartLegendItem>
        ))}
      </ChartLegend>
    </>
  );
}

function KillCurve({ points, query }: CurveProps) {
  const [target, setTarget] = useState<KillTarget>("heroes");
  const selected = KILL_TARGETS[target];
  const label = "kills over the match";
  const rows = points.map((point) => {
    const value = point[selected.avg];
    const std = point[selected.std];
    return { time: point.game_time, value, std, band: [Math.max(0, value - std), value + std] };
  });
  const last = rows.at(-1);

  return (
    <>
      <Segmented
        size="sm"
        width="hug"
        aria-label="Kill target"
        className="self-end"
        value={target}
        onValueChange={setTarget}
      >
        {(Object.keys(KILL_TARGETS) as KillTarget[]).map((key) => (
          <SegmentedItem key={key} value={key}>
            {KILL_TARGETS[key].label}
          </SegmentedItem>
        ))}
      </Segmented>
      {query.isPending ? (
        <ChartLoading label={label} />
      ) : query.isError ? (
        <ChartError label={label} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <ChartEmpty label={label} />
      ) : (
        <ChartSurface
          label={`${selected.reading} by game minute, with the spread between players.${
            last ? ` At ${minuteLabel(last.time)}: ${last.value.toFixed(selected.digits)}.` : ""
          }`}
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
            <YAxis {...CHART_Y_AXIS} label={{ ...CHART_Y_LABEL, value: `Avg ${selected.label}` }} />
            <Tooltip
              cursor={CHART_CURSOR_LINE}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <ChartReadings title={`At ${minuteLabel(row.time)}`}>
                    <ChartReading label={selected.reading}>{row.value.toFixed(selected.digits)}</ChartReading>
                    <ChartReading label="Std dev">± {row.std.toFixed(selected.digits)}</ChartReading>
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
    </>
  );
}
