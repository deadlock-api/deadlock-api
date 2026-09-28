import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import type { PlayerPerformanceCurvePoint } from "deadlock_api_client";
import { Hourglass } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_MEDIAN_LINE,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { NoValue } from "~/components/ui/no-value";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Stack } from "~/components/ui/stack";
import { formatCompactAxisTick, niceTicks } from "~/lib/chart-axis";
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
  souls: { label: "Souls", key: "net_worth_avg", digits: 0 },
  kills: { label: "Kills", key: "kills_avg", digits: 1 },
  deaths: { label: "Deaths", key: "deaths_avg", digits: 1 },
} as const satisfies Record<string, { label: string; key: keyof PlayerPerformanceCurvePoint; digits: number }>;
type TimelineMetric = keyof typeof METRICS;

interface Row {
  /** Seconds into the match. */
  time: number;
  /** Each player's lead over the average player (negative: behind); null where either has no value. */
  lead: Record<string, number | null>;
  /** Each player's own average, and the average player's under `field`. */
  value: Record<string, number | null>;
}

const FIELD = "field";

function formatValue(value: number, digits: number): string {
  return digits === 0 ? formatStatValue(value, "integer") : value.toFixed(digits);
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
 * Where each compared player stands at each point of a match: their average souls, kills or deaths by game minute,
 * drawn as the lead over the average player on the same filters (the dashed zero line). Who wins the lane, who scales.
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
  const [metric, setMetric] = useState<TimelineMetric>("souls");
  const own = useQueries({
    queries: players.map((player) => ({
      ...playerPerformanceCurveQueryOptions(curveParams(filters, player.accountId)),
      placeholderData: keepPreviousData,
    })),
  });
  // Everyone's curve, the zero line every lead is measured from. A timeout is not retried: the averages stand in.
  const field = useQuery({
    ...playerPerformanceCurveQueryOptions(curveParams(filters)),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const pending = own.some((query) => query.isPending);
  const failed = own.length > 0 && own.every((query) => query.isError && !query.data);
  // Leads need the field, which is slow to compute cold and can time out on a long date range: until it is in (or when
  // it fails) the players' own averages are drawn instead.
  const relative = field.data !== undefined;

  const selected = METRICS[metric];
  const keys = players.map((player) => String(player.accountId));
  const times = new Set<number>();
  for (const query of own) {
    for (const point of query.data ?? []) if (point.game_time <= LAST_MINUTE * 60) times.add(point.game_time);
  }
  const valueAt = (points: PlayerPerformanceCurvePoint[] | undefined, time: number) => {
    const point = points?.find((entry) => entry.game_time === time);
    return point ? point[selected.key] : null;
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
      return { time, lead, value };
    });
  const plotted = (row: Row, key: string) => (relative ? row.lead[key] : row.value[key]);
  const leads = rows.flatMap((row) => keys.flatMap((key) => plotted(row, key) ?? []));
  const ticks = niceTicks(Math.min(0, ...leads), Math.max(0, ...leads, selected.digits === 0 ? 1 : 0.1));
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const tenMinutes = rows.find((row) => row.time === 720) ?? rows.find((row) => row.time >= 600);
  const summary = `${selected.label} by game minute${relative ? ", as the lead over the average player on the same filters" : ""}.${
    tenMinutes
      ? ` At ${minuteLabel(tenMinutes.time)}: ${players
          .map((player, index) => {
            const shown = plotted(tenMinutes, keys[index]);
            return `${player.name} ${shown == null ? "no data" : relative ? formatLead(shown, selected.digits) : formatValue(shown, selected.digits)}`;
          })
          .join(", ")}.`
      : ""
  }`;

  // A fixed plot height: it sets its row's height, which the activity panels beside it grow into.
  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Match timeline" icon={Hourglass}>
        <Segmented size="sm" width="hug" aria-label="Timeline metric" value={metric} onValueChange={setMetric}>
          {(Object.keys(METRICS) as TimelineMetric[]).map((key) => (
            <SegmentedItem key={key} value={key}>
              {METRICS[key].label}
            </SegmentedItem>
          ))}
        </Segmented>
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
            <ChartLoading label={LABEL} size="md" />
          ) : (
            <ChartSurface label={summary} announce="label" size="md" variant="flush">
              <LineChart data={rows} margin={CHART_MARGIN} accessibilityLayer={false}>
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
                            color="var(--chart-axis)"
                            extra={
                              row.value[FIELD] == null ? undefined : formatValue(row.value[FIELD], selected.digits)
                            }
                          >
                            ±0
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
                    activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ChartSurface>
          )}
          <ChartLegend label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                <span className="max-w-full truncate">{player.name}</span>
              </ChartLegendItem>
            ))}
            {relative && (
              <ChartLegendItem color="var(--chart-axis)" shape="dashed">
                Average player
              </ChartLegendItem>
            )}
          </ChartLegend>
        </Stack>
      </PanelBody>
    </Panel>
  );
}
