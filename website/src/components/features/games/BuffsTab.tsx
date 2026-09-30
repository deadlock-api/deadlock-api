import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AnalyticsApiBuffStatsRequest,
  AnalyticsApiGameStatsRequest,
  AnalyticsBuffStats,
} from "deadlock_api_client";
import { Hourglass, ListOrdered, Sparkles } from "lucide-react";
import { Fragment } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_X_LABEL,
  CHART_Y_AXIS,
  CHART_Y_LABEL,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Badge } from "~/components/ui/badge";
import { NoValue } from "~/components/ui/no-value";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import {
  BUFF_TIMINGS_NOTE,
  type BuffInfo,
  buffMatchBase,
  formatBuffValue,
  isBuffAddedWithTimings,
  humanizeBuffStat,
  parseBuffType,
  summarizeBuffStats,
} from "~/lib/buffs";
import { formatStatValue } from "~/lib/stat-format";
import { buffInfoQueryOptions } from "~/queries/asset-queries";
import { buffStatsQueryOptions } from "~/queries/buff-stats-query";
import { gameStatsQueryOptions } from "~/queries/games-query";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

/** Past this few matches are left, so the curve swings (as on the player comparison's timeline). */
const LAST_MINUTE = 45;

const minuteLabel = (seconds: number) => `${Math.round(seconds / 60)}m`;

function Timing({ seconds }: { seconds: number | null | undefined }) {
  return seconds == null ? <NoValue label={BUFF_TIMINGS_NOTE} /> : <>{formatStatValue(seconds, "duration")}</>;
}

interface BuffsTabProps {
  params: AnalyticsApiGameStatsRequest;
}

export default function BuffsTab({ params }: BuffsTabProps) {
  const buffParams: AnalyticsApiBuffStatsRequest = {
    gameMode: params.gameMode,
    matchMode: params.matchMode,
    minUnixTimestamp: params.minUnixTimestamp,
    maxUnixTimestamp: params.maxUnixTimestamp,
    minDurationS: params.minDurationS,
    maxDurationS: params.maxDurationS,
    minAverageBadge: params.minAverageBadge,
    maxAverageBadge: params.maxAverageBadge,
  };
  const buffQuery = useQuery({ ...buffStatsQueryOptions(buffParams), placeholderData: keepPreviousData });
  // Names, units and colors; without them the buffs still show under their class names.
  const { data: info = new Map<string, BuffInfo>() } = useQuery(buffInfoQueryOptions);
  const { data: gameStats } = useQuery(gameStatsQueryOptions({ ...params, bucket: "no_bucket" }));

  if (buffQuery.isPending) {
    return <LoadingState label="buff stats" className="flex items-center justify-center py-16" />;
  }
  if (buffQuery.isError && !buffQuery.data) {
    return (
      <ErrorState
        title="Buff stats did not load"
        retrying={buffQuery.isFetching}
        onRetry={() => void buffQuery.refetch()}
      />
    );
  }

  const rows = buffQuery.data;
  const stats = summarizeBuffStats(rows, info);
  if (stats.length === 0) {
    return (
      <EmptyState title="No buff pickups for these filters" description="Try a wider date range or fewer filters." />
    );
  }

  const permanent = rows.filter((row) => row.is_permanent && row.pickups > 0);
  const temporary = rows.filter((row) => !row.is_permanent && row.pickups > 0);
  const timedMatches = permanent[0]?.timed_matches ?? 0;
  // Each stat over the matches that could have it, so the buffs the update added are not diluted by older matches.
  const pickupsPerMatch = stats.reduce((sum, stat) => sum + stat.pickupsPerMatch, 0);
  const maxPerMatch = Math.max(...stats.map((stat) => stat.pickupsPerMatch));

  return (
    <StaleOverlay active={buffQuery.isPlaceholderData} label="buff stats" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <Panel className="h-full">
          <PanelHeader
            title="Pickups by Stat"
            icon={Sparkles}
            description="Golden statue buffs per player and match, all levels together"
          />
          <PanelBody className="@container flex flex-1 flex-col gap-5">
            <StatGroup variant="joined" size="sm" className="grid-cols-1 @sm:grid-cols-3">
              <Stat
                label="Pickups / Match"
                value={pickupsPerMatch.toFixed(1)}
                align="center"
                title="Permanent buffs one player picks up in an average match"
              />
              <Stat
                label="First Pickup"
                value={<Timing seconds={gameStats?.[0]?.avg_first_permanent_buff_time_s} />}
                align="center"
                title="Average game time of a player's first permanent buff"
              />
              <Stat
                label="Timed Matches"
                value={timedMatches.toLocaleString("en-US")}
                align="center"
                title="Player-matches with pickup times, which the stat gains below are averaged over"
              />
            </StatGroup>

            <ul className="flex flex-col gap-3" aria-label="Buff pickups per match by stat">
              {stats.map((stat) => (
                <li key={stat.stat} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <ChartSwatch color={stat.color ?? CHART_COLOR.fallback} />
                    <span className="min-w-0 flex-1 truncate text-sm">{stat.name}</span>
                    {stat.levels.every(isBuffAddedWithTimings) && (
                      <Badge variant="muted" size="sm" title="Rates over matches since the update that added this buff">
                        New
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {stat.valuePerMatch == null ? (
                        <NoValue label={BUFF_TIMINGS_NOTE} />
                      ) : (
                        `+${formatBuffValue(stat.valuePerMatch, stat.unit)}`
                      )}
                    </span>
                    <span className="w-12 text-end text-sm font-semibold tabular-nums">
                      {stat.pickupsPerMatch.toFixed(2)}
                    </span>
                  </div>
                  <ProgressBar value={stat.pickupsPerMatch} max={maxPerMatch} color={stat.color ?? undefined} />
                </li>
              ))}
            </ul>
            <Text variant="caption" tone="muted">
              Each row shows the stat gained per match (+), then the pickups per match the bar draws.{" "}
              {BUFF_TIMINGS_NOTE}
            </Text>
          </PanelBody>
        </Panel>

        <Panel className="h-full">
          <PanelHeader
            title="Buffs Over the Match"
            icon={Hourglass}
            description="Average permanent buffs collected by each game minute"
          />
          <PanelBody className="flex flex-1 flex-col justify-center">
            <BuffCurve params={params} />
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Every Buff Level" icon={ListOrdered} description={BUFF_TIMINGS_NOTE} />
        <BuffLevelTable stats={stats} temporary={temporary} info={info} />
      </Panel>
    </StaleOverlay>
  );
}

function levelLabel(row: AnalyticsBuffStats, info: Map<string, BuffInfo>): string {
  return info.get(row.buff_type)?.name ?? humanizeBuffStat(parseBuffType(row.buff_type).stat);
}

function BuffLevelRow({ row, info }: { row: AnalyticsBuffStats; info: Map<string, BuffInfo> }) {
  const base = buffMatchBase(row);
  const perMatch = base > 0 ? row.pickups / base : 0;
  const share = base > 0 ? Math.min(1, row.matches_with_pickup / base) : 0;
  return (
    <TableRow>
      <TableCell data-pinned>{levelLabel(row, info)}</TableCell>
      <TableCell className="text-end tabular-nums">{perMatch.toFixed(2)}</TableCell>
      <TableCell className="hidden text-end tabular-nums @md/table:table-cell">
        {formatStatValue(share, "percent")}
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {row.is_permanent ? <Timing seconds={row.avg_pickup_time_s} /> : <NoValue label="Not recorded" />}
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {row.is_permanent ? <Timing seconds={row.avg_first_pickup_time_s} /> : <NoValue label="Not recorded" />}
      </TableCell>
    </TableRow>
  );
}

function BuffLevelTable({
  stats,
  temporary,
  info,
}: {
  stats: ReturnType<typeof summarizeBuffStats>;
  temporary: AnalyticsBuffStats[];
  info: Map<string, BuffInfo>;
}) {
  return (
    <Table aria-label="Pickups and timings of every buff level" density="compact">
      <TableHeader tone="muted">
        <TableRow>
          <TableHead data-pinned>Buff</TableHead>
          <TableHead className="text-end">Pickups / Match</TableHead>
          <TableHead className="hidden text-end @md/table:table-cell">Picked Up By</TableHead>
          <TableHead className="text-end">Avg Pickup</TableHead>
          <TableHead className="text-end">Avg First Pickup</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stats.map((stat) => (
          <Fragment key={stat.stat}>
            <TableRow tone="section">
              <TableCell data-pinned colSpan={5} className="font-medium">
                <span className="flex items-center gap-2">
                  <ChartSwatch color={stat.color ?? CHART_COLOR.fallback} />
                  {stat.name}
                  {stat.levels.every(isBuffAddedWithTimings) && (
                    <Badge variant="muted" size="sm" title="Rates over matches since the update that added this buff">
                      New since Sep 29
                    </Badge>
                  )}
                </span>
              </TableCell>
            </TableRow>
            {stat.levels.map((row) => (
              <BuffLevelRow key={row.buff_type} row={row} info={info} />
            ))}
          </Fragment>
        ))}
        {temporary.length > 0 && (
          <>
            <TableRow tone="section">
              <TableCell data-pinned colSpan={5} className="font-medium">
                Temporary power-ups (no pickup times)
              </TableCell>
            </TableRow>
            {temporary.map((row) => (
              <BuffLevelRow key={row.buff_type} row={row} info={info} />
            ))}
          </>
        )}
      </TableBody>
    </Table>
  );
}

/** Average permanent buffs collected by each game minute; only players with recorded pickup times count. */
function BuffCurve({ params }: { params: AnalyticsApiGameStatsRequest }) {
  const { data, isPending, isError, isFetching, refetch } = useQuery(
    playerPerformanceCurveQueryOptions({
      // Absolute game time (3, 6, 9 … minutes) rather than shares of the match.
      resolution: 0,
      gameMode: params.gameMode,
      matchMode: params.matchMode,
      minUnixTimestamp: params.minUnixTimestamp,
      maxUnixTimestamp: params.maxUnixTimestamp,
      minDurationS: params.minDurationS,
      maxDurationS: params.maxDurationS,
      minAverageBadge: params.minAverageBadge,
      maxAverageBadge: params.maxAverageBadge,
    }),
  );
  const points = (data ?? [])
    .filter((point) => point.game_time <= LAST_MINUTE * 60 && point.permanent_buffs_avg != null)
    .sort((a, b) => a.game_time - b.game_time)
    .map((point) => ({ time: point.game_time, buffs: point.permanent_buffs_avg as number }));
  const label = "buffs over the match";

  if (isPending) return <ChartLoading label={label} />;
  if (isError) return <ChartError label={label} retrying={isFetching} onRetry={() => void refetch()} />;
  if (points.length === 0) return <ChartEmpty label={label} description={BUFF_TIMINGS_NOTE} />;

  return (
    <ChartSurface label="Average permanent buffs collected by game minute" variant="bare">
      <LineChart data={points} margin={{ ...CHART_MARGIN, top: 16, right: 16 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis
          {...CHART_X_AXIS}
          dataKey="time"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={minuteLabel}
          label={{ ...CHART_X_LABEL, value: "Game Time" }}
        />
        <YAxis {...CHART_Y_AXIS} label={{ ...CHART_Y_LABEL, value: "Avg Buffs" }} />
        <Tooltip
          cursor={CHART_CURSOR_LINE}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as (typeof points)[number] | undefined;
            if (!active || !point) return null;
            return (
              <ChartReadings title={`At ${minuteLabel(point.time)}`}>
                <ChartReading label="Buffs collected">{point.buffs.toFixed(1)}</ChartReading>
              </ChartReadings>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="buffs"
          stroke={CHART_COLOR.primary}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartSurface>
  );
}
