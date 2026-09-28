import { CalendarClock } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Grid } from "~/components/ui/grid";
import { NoValue } from "~/components/ui/no-value";
import { Stack } from "~/components/ui/stack";
import { day } from "~/dayjs";
import { useHydrated } from "~/hooks/useHydrated";
import { matchesByHour, matchesByWeekday } from "~/lib/compare-records";
import { formatPercent } from "~/lib/format";

import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

const LABEL = "when they play";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

/** One point of either plot: a label, and per player key the share of their matches and the count behind it. */
interface Point {
  label: string;
  /** The tooltip's heading. */
  title: string;
  share: Record<string, number | null>;
  matches: Record<string, number>;
  wins: Record<string, number>;
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/**
 * When each compared player plays: the share of their matches by hour of day and by weekday, on the viewer's own
 * clock. Drawn only once hydrated, since the server renders in UTC and does not know the viewer's time zone.
 */
export function ActivityPanel({
  players,
  histories,
  className,
}: {
  players: ComparedPlayer[];
  /** The players' match histories on the filters, in the players' order (`useCompareMatchHistories`). */
  histories: readonly CompareMatchHistory[];
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const hydrated = useHydrated();
  const pending = !hydrated || histories.some((history) => history.isPending);
  const allFailed = histories.length > 0 && histories.every((history) => history.isError);
  const settled = !histories.some((history) => history.isPending);
  if (settled && !allFailed && histories.every((history) => (history.matches?.length ?? 0) === 0)) return null;

  const keys = players.map((player) => String(player.accountId));
  const totals = histories.map((history) => history.matches?.length ?? 0);
  const point = (label: string, title: string, counts: { matches: number; wins: number }[]): Point => ({
    label,
    title,
    share: Object.fromEntries(
      keys.map((key, index) => [key, totals[index] > 0 ? counts[index].matches / totals[index] : null]),
    ),
    matches: Object.fromEntries(keys.map((key, index) => [key, counts[index].matches])),
    wins: Object.fromEntries(keys.map((key, index) => [key, counts[index].wins])),
  });
  // Local hours and weekdays: only read once hydrated, below.
  const byHour = pending
    ? []
    : histories.map((history) => matchesByHour(history.matches ?? [], (unix) => day.unix(unix).hour()));
  const byWeekday = pending
    ? []
    : histories.map((history) => matchesByWeekday(history.matches ?? [], (unix) => (day.unix(unix).day() + 6) % 7));
  const hours = pending
    ? []
    : Array.from({ length: 24 }, (_, hour) =>
        point(
          hourLabel(hour),
          `${hourLabel(hour)} – ${hourLabel((hour + 1) % 24)}`,
          byHour.map((buckets) => buckets[hour]),
        ),
      );
  const weekdays = pending
    ? []
    : WEEKDAYS.map((label, weekday) =>
        point(
          label,
          label,
          byWeekday.map((buckets) => buckets[weekday]),
        ),
      );

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="When they play" icon={CalendarClock} />
      <PanelBody size="sm">
        <Stack gap={2}>
          {allFailed ? (
            <ChartError
              label={LABEL}
              onRetry={() => {
                for (const history of histories) if (history.isError) history.refetch();
              }}
            />
          ) : pending ? (
            <ChartLoading label={LABEL} size="md" />
          ) : (
            <Grid gap={4} className="@2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <ShareChart
                players={players}
                keys={keys}
                points={hours}
                ticks={HOUR_TICKS.map(hourLabel)}
                summary={`Share of each player's matches by the hour they started, local time. ${summarize(players, keys, hours)}`}
              />
              <ShareChart
                players={players}
                keys={keys}
                points={weekdays}
                summary={`Share of each player's matches by weekday, local time. ${summarize(players, keys, weekdays)}`}
              />
            </Grid>
          )}
          <ChartLegend label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                <span className="max-w-full truncate">{player.name}</span>
              </ChartLegendItem>
            ))}
          </ChartLegend>
        </Stack>
      </PanelBody>
    </Panel>
  );
}

/** "A plays most at 21:00 (12%); B …": each player's busiest point. */
function summarize(players: ComparedPlayer[], keys: string[], points: Point[]): string {
  return players
    .map((player, index) => {
      const key = keys[index];
      const busiest = points.reduce<Point | null>(
        (best, candidate) => ((candidate.share[key] ?? -1) > (best ? (best.share[key] ?? -1) : -1) ? candidate : best),
        null,
      );
      const share = busiest?.share[key];
      return share == null
        ? `${player.name} no matches`
        : `${player.name} most at ${busiest!.label} (${formatPercent(share, 0)})`;
    })
    .join("; ");
}

function ShareChart({
  players,
  keys,
  points,
  ticks,
  summary,
}: {
  players: ComparedPlayer[];
  keys: string[];
  points: Point[];
  /** The x labels to print; every point's label when left out. */
  ticks?: string[];
  summary: string;
}) {
  // Three ticks on a 5% grid: the plot is short, and the shape matters more than the exact share.
  const max = Math.max(0.05, ...points.flatMap((entry) => keys.map((key) => entry.share[key] ?? 0)));
  const top = Math.ceil(max * 10) / 10;
  const domain: [number, number] = [0, top];
  const yTicks = [0, top / 2, top];
  return (
    <ChartSurface label={summary} announce="label" size="md" variant="flush">
      <LineChart data={points} margin={CHART_MARGIN} accessibilityLayer={false}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis {...CHART_X_AXIS} dataKey="label" ticks={ticks} interval={ticks ? 0 : "preserveStartEnd"} />
        <YAxis
          {...CHART_Y_AXIS}
          type="number"
          domain={domain}
          ticks={yTicks}
          interval={0}
          tickFormatter={(value: number) => formatPercent(value, 0)}
        />
        <Tooltip
          cursor={CHART_CURSOR_LINE}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const entry = payload?.[0]?.payload as Point | undefined;
            if (!active || !entry) return null;
            return (
              <ChartReadings
                title={`${entry.title} (local time)`}
                valueLabel="Share"
                extraLabel="Matches"
                label={`Share of matches, ${entry.title}`}
              >
                {players.map((player, index) => {
                  const key = keys[index];
                  const share = entry.share[key];
                  return (
                    <ChartReading
                      key={player.accountId}
                      label={player.name}
                      color={player.color}
                      extra={entry.matches[key] ?? 0}
                    >
                      {share == null ? <NoValue /> : formatPercent(share)}
                    </ChartReading>
                  );
                })}
              </ChartReadings>
            );
          }}
        />
        {players.map((player, index) => (
          <Line
            key={keys[index]}
            name={player.name}
            dataKey={(entry: Point) => entry.share[keys[index]]}
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
  );
}
