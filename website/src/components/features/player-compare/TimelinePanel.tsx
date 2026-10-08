import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import type { PlayerPerformanceCurvePoint } from "deadlock_api_client";
import { Hourglass } from "lucide-react";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { MetricSelect } from "~/components/patterns/charts/MetricSelect";
import {
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_MEDIAN_LINE,
  CHART_SPREAD_BAND,
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_ACTIVE_DOT,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { NoValue } from "~/components/ui/no-value";
import { SelectGroup, SelectItem, SelectLabel } from "~/components/ui/select";
import { Stack } from "~/components/ui/stack";
import { BUFF_TIMINGS_NOTE } from "~/lib/buffs";
import { formatCompactAxisTick, niceTicks } from "~/lib/chart-axis";
import { hasSoulEconomy } from "~/lib/game-mode";
import { formatStatValue } from "~/lib/stat-format";
import { type CompareFilters } from "~/queries/player-compare-queries";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

import type { ComparedPlayer } from "./types";

const LABEL = "match timeline";
/**
 * The timeline ends here: past it only a player's few longest matches are left, so the averages swing (the deaths of
 * three long games can average below the whole field's).
 */
const LAST_MINUTE = 45;
const METRICS = {
  souls: { label: "Souls", key: "net_worth_avg", std: "net_worth_std", digits: 0 },
  lastHits: { label: "Last hits", key: "creep_kills_avg", std: "creep_kills_std", digits: 0 },
  denies: { label: "Denies", key: "denies_avg", std: "denies_std", digits: 1 },
  kills: { label: "Kills", key: "kills_avg", std: "kills_std", digits: 1 },
  deaths: { label: "Deaths", key: "deaths_avg", std: "deaths_std", digits: 1 },
  assists: { label: "Assists", key: "assists_avg", std: "assists_std", digits: 1 },
  heroDamage: { label: "Hero damage", key: "player_damage_avg", std: "player_damage_std", digits: 0 },
  objectiveDamage: { label: "Objective damage", key: "boss_damage_avg", std: "boss_damage_std", digits: 0 },
  healing: { label: "Healing", key: "player_healing_avg", std: "player_healing_std", digits: 0 },
  barriers: { label: "Barriers", key: "player_barriering_avg", std: "player_barriering_std", digits: 0 },
  selfDamage: { label: "Self damage", key: "self_damage_avg", std: "self_damage_std", digits: 0 },
  // Permanent buff pickups so far. Only matches since the City Never Sleeps update record when they happen.
  buffs: { label: "Buffs", key: "permanent_buffs_avg", std: "permanent_buffs_std", digits: 1 },
} as const satisfies Record<
  string,
  { label: string; key: keyof PlayerPerformanceCurvePoint; std: keyof PlayerPerformanceCurvePoint; digits: number }
>;
type TimelineMetric = keyof typeof METRICS;
const METRIC_GROUPS: { label: string; metrics: TimelineMetric[] }[] = [
  { label: "Economy", metrics: ["souls", "lastHits", "denies"] },
  { label: "Combat", metrics: ["kills", "deaths", "assists", "heroDamage"] },
  { label: "Objectives", metrics: ["objectiveDamage", "buffs"] },
  { label: "Sustain", metrics: ["healing", "barriers", "selfDamage"] },
];

interface Row {
  /** Seconds into the match. */
  time: number;
  /** Each player's lead over the average player (negative: behind); null where either has no value. */
  lead: Record<string, number | null>;
  /** Each player's own average, and the average player's under `field`. */
  value: Record<string, number | null>;
  /** The spread between players on the same filters (one standard deviation); null without the field's curve. */
  spread: number | null;
}

const FIELD = "field";

function formatValue(value: number, digits: number): string {
  return digits === 0 ? (formatStatValue(value, "integer") ?? "") : value.toFixed(digits);
}

function formatLead(value: number, digits: number): string {
  const shown = formatValue(Math.abs(value), digits);
  return Number(shown.replace(/,/g, "")) === 0 ? `±${shown}` : `${value > 0 ? "+" : "\u2212"}${shown}`;
}

/** A timeline request on the comparison's filters: one player's (`accountId`) or everyone's. */
function curveParams(filters: CompareFilters, accountId?: number) {
  return {
    // Absolute game time (3, 6, 9 … minutes) rather than shares of the match.
    resolution: 0,
    accountIds: accountId != null ? [accountId] : undefined,
    heroIds: filters.heroId != null ? String(filters.heroId) : undefined,
    gameMode: filters.gameMode,
    matchMode: filters.matchMode,
    minUnixTimestamp: filters.minUnixTimestamp ?? 0,
    maxUnixTimestamp: filters.maxUnixTimestamp,
  };
}

const minuteLabel = (seconds: number) => `${Math.round(seconds / 60)}m`;

/**
 * Where each compared player stands at each point of a match: their average souls (not in Street Brawl), last hits,
 * kills, damage and more by game minute, drawn as the lead over the average player on the same filters (the dashed
 * zero line). Who wins the lane, who scales.
 */
export function TimelinePanel({
  players,
  filters,
  className,
}: {
  players: ComparedPlayer[];
  filters: CompareFilters;
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const [chosenMetric, setMetric] = useState<TimelineMetric>("souls");
  // Street Brawl hands every player the same souls each round: no souls line there, and kills stand in for it until
  // the mode changes back.
  const metrics = (Object.keys(METRICS) as TimelineMetric[]).filter(
    (key) => key !== "souls" || hasSoulEconomy(filters.gameMode),
  );
  const metric = metrics.includes(chosenMetric) ? chosenMetric : "kills";
  const own = useQueries({
    queries: players.map((player) => ({
      ...playerPerformanceCurveQueryOptions(curveParams(filters, player.accountId)),
      placeholderData: keepPreviousData,
    })),
  });
  // Everyone's curve, the zero line every lead is measured from. A timeout is not retried: the averages stand in.
  // No placeholder: a lead measured against the previous filters' field would be a wrong number.
  const field = useQuery({ ...playerPerformanceCurveQueryOptions(curveParams(filters)), retry: false });
  const pending = own.some((query) => query.isPending);
  const failed = own.length > 0 && own.every((query) => query.isError && !query.data);
  // Leads need the field, which is slow to compute cold and can time out on a long date range: until it is in (or when
  // it fails) the players' own averages are drawn instead.
  const relative = field.data !== undefined && !own.some((query) => query.isPlaceholderData);

  const selected = METRICS[metric];
  const keys = players.map((player) => String(player.accountId));
  const times = new Set<number>();
  for (const query of own) {
    for (const point of query.data ?? []) if (point.game_time <= LAST_MINUTE * 60) times.add(point.game_time);
  }
  const valueAt = (
    points: PlayerPerformanceCurvePoint[] | undefined,
    time: number,
    key: keyof PlayerPerformanceCurvePoint = selected.key,
  ) => {
    const point = points?.find((entry) => entry.game_time === time);
    return point?.[key] ?? null;
  };
  const rows: Row[] = [...times]
    .sort((a, b) => a - b)
    .map((time) => {
      const average = valueAt(field.data, time);
      const value: Record<string, number | null> = {
        ...Object.fromEntries(keys.map((key, index) => [key, valueAt(own[index]?.data, time)])),
        [FIELD]: average,
      };
      const lead = Object.fromEntries(
        keys.map((key) => [key, value[key] != null && average != null ? value[key] - average : null]),
      );
      return { time, lead, value, spread: valueAt(field.data, time, selected.std) };
    });
  const plotted = (row: Row, key: string) => (relative ? row.lead[key] : row.value[key]);
  // The ±1σ band around the zero line: how far the field itself spreads, so a lead can be read as big or small.
  const band = (row: Row) => (relative && row.spread != null ? [-row.spread, row.spread] : null);
  const leads = rows.flatMap((row) => [...keys.flatMap((key) => plotted(row, key) ?? []), ...(band(row) ?? [])]);
  const ticks = niceTicks(Math.min(0, ...leads), Math.max(0, ...leads, selected.digits === 0 ? 1 : 0.1));
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const tenMinutes = rows.find((row) => row.time === 720) ?? rows.find((row) => row.time >= 600);
  const summary = `${selected.label} by game minute${relative ? ", as the lead over the average player on the same filters, with the spread between players (one standard deviation) shaded" : ""}.${
    tenMinutes
      ? ` At ${minuteLabel(tenMinutes.time)}: ${players
          .map((player, index) => {
            const shown = plotted(tenMinutes, keys[index]);
            return `${player.name} ${shown == null ? "no data" : relative ? formatLead(shown, selected.digits) : formatValue(shown, selected.digits)}`;
          })
          .join(", ")}.`
      : ""
  }`;

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Match timeline" icon={Hourglass}>
        <MetricSelect
          value={metric}
          valueLabel={selected.label}
          onValueChange={(next) => setMetric(next as TimelineMetric)}
          label="Timeline metric"
          className="w-auto @sm:min-w-40"
        >
          {METRIC_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.metrics
                .filter((key) => metrics.includes(key))
                .map((key) => (
                  <SelectItem key={key} value={key}>
                    {METRICS[key].label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </MetricSelect>
      </PanelHeader>
      <PanelBody size="sm" className="flex flex-1 flex-col">
        <Stack gap={2} className="flex-1">
          {failed ? (
            <ChartError
              label={LABEL}
              onRetry={() => {
                for (const query of own) if (query.isError) void query.refetch();
              }}
            />
          ) : pending ? (
            <ChartLoading label={LABEL} size="grow" />
          ) : rows.every((row) => keys.every((key) => row.value[key] == null)) ? (
            <ChartEmpty
              label={LABEL}
              description={metric === "buffs" ? BUFF_TIMINGS_NOTE : undefined}
              className="min-h-32 flex-1"
            />
          ) : (
            <ChartSurface label={summary} announce="label" size="grow" variant="flush">
              <ComposedChart data={rows} margin={CHART_MARGIN} accessibilityLayer={false}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis
                  {...CHART_X_AXIS}
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  ticks={rows.map((row) => row.time)}
                  tickFormatter={minuteLabel}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  {...CHART_Y_AXIS}
                  type="number"
                  domain={[ticks[0], ticks.at(-1) ?? 1]}
                  ticks={ticks}
                  interval={0}
                  tickFormatter={(value: number) =>
                    (relative && value > 0 ? "+" : "") + formatCompactAxisTick(value, step)
                  }
                />
                {relative && <Area type="monotone" dataKey={band} fill={CHART_COLOR.neutral} {...CHART_SPREAD_BAND} />}
                {relative && <ReferenceLine y={0} {...CHART_MEDIAN_LINE} />}
                <Tooltip
                  cursor={CHART_CURSOR_LINE}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as Row | undefined;
                    if (!active || !row) return null;
                    return (
                      <ChartReadings
                        title={`At ${minuteLabel(row.time)}`}
                        valueLabel={relative ? "Lead" : selected.label}
                        extraLabel={relative ? selected.label : undefined}
                        label={`${selected.label} at ${minuteLabel(row.time)}, against the average player`}
                      >
                        {players.map((player, index) => {
                          const lead = row.lead[keys[index]];
                          const value = row.value[keys[index]];
                          return (
                            <ChartReading
                              key={player.accountId}
                              label={player.name}
                              color={player.color}
                              extra={!relative || value == null ? undefined : formatValue(value, selected.digits)}
                            >
                              {!relative ? (
                                value == null ? (
                                  <NoValue />
                                ) : (
                                  formatValue(value, selected.digits)
                                )
                              ) : lead == null ? (
                                <NoValue />
                              ) : (
                                formatLead(lead, selected.digits)
                              )}
                            </ChartReading>
                          );
                        })}
                        {relative && (
                          <ChartReading
                            label="Average player"
                            color={CHART_COLOR.reference}
                            extra={
                              row.value[FIELD] == null ? undefined : formatValue(row.value[FIELD], selected.digits)
                            }
                          >
                            ±0
                          </ChartReading>
                        )}
                        {relative && row.spread != null && (
                          <ChartReading label="Spread (1σ)" color={CHART_COLOR.neutral}>
                            ±{formatValue(row.spread, selected.digits)}
                          </ChartReading>
                        )}
                      </ChartReadings>
                    );
                  }}
                />
                {players.map((player, index) => (
                  <Line
                    key={keys[index]}
                    name={player.name}
                    dataKey={(row: Row) => plotted(row, keys[index])}
                    type="monotone"
                    stroke={player.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={CHART_ACTIVE_DOT}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ChartSurface>
          )}
          <ChartLegend label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                <span className="max-w-full truncate">{player.name}</span>
              </ChartLegendItem>
            ))}
            {relative && (
              <ChartLegendItem color={CHART_COLOR.reference} shape="dashed">
                Average player
              </ChartLegendItem>
            )}
            {relative && (
              <ChartLegendItem color={CHART_COLOR.neutral} shape="square">
                Spread (±1σ)
              </ChartLegendItem>
            )}
          </ChartLegend>
        </Stack>
      </PanelBody>
    </Panel>
  );
}
