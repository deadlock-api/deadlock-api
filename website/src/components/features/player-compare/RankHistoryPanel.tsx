import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import { Medal } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { RANK_BADGE_NAME_AXIS_WIDTH, RankBadgeTick } from "~/components/domain/rank/RankBadgeTick";
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
  CHART_ACTIVE_DOT,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { NoValue } from "~/components/ui/no-value";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Stack } from "~/components/ui/stack";
import { day } from "~/dayjs";
import { niceTicks } from "~/lib/chart-axis";
import {
  dailyRanks,
  dayTicks,
  mergeRankSeries,
  rankAxis,
  type RankByMatchRow,
  rankByMatchNumber,
  rankDayExtent,
  type RankRow,
  utcDay,
} from "~/lib/compare-rank-history";
import { type MatchMode, modeFromParams } from "~/lib/game-mode";
import { badgeLabel } from "~/lib/rank-utils";
import { formatStatValue } from "~/lib/stat-format";
import { rankHistoryPoints } from "~/lib/tracker/compute";
import type { CompareFilters } from "~/queries/player-compare-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { LoneDot } from "./LoneDot";
import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

const LABEL = "rank over time";
const shortDate = (unix: number) => day.unix(unix).utc().format("MMM D");
const longDate = (unix: number) => day.unix(unix).utc().format("MMM D, YYYY");

/**
 * Every compared player's rank across the page's dates, one step line each: by date (one point per day), or by ranked
 * match number, so two climbs compare by the matches they took.
 */
export function RankHistoryPanel({
  players,
  filters,
  histories,
  className,
}: {
  players: ComparedPlayer[];
  filters: CompareFilters;
  /** The players' match histories on the filters, in the players' order (`useCompareMatchHistories`). */
  histories: readonly CompareMatchHistory[];
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const mode = modeFromParams(
    filters.gameMode === "street_brawl" ? "street_brawl" : "normal",
    filters.matchMode as MatchMode,
  );
  const { data: ranks } = useQuery(ranksQueryOptions);
  const [axisBy, setAxisBy] = useState<"date" | "matches">("date");
  const showsRank = mode === "normal_all" || mode === "normal_ranked";

  // Hidden without ranks to draw: a mode that moves no rank, or nobody ranked on these dates.
  const allFailed = histories.length > 0 && histories.every((history) => history.isError);
  const settled = !histories.some((history) => history.isPending);
  const anyRanked = histories.some((history) =>
    (history.matches ?? []).some((match) => (match.ranked_display_badge ?? 0) > 0),
  );
  if (!showsRank || (settled && !allFailed && !anyRanked)) return null;
  const daysByPlayer = histories.map((history) => dailyRanks(history.matches ?? []));
  // Oldest first, the rank after each ranked match: for the by-matches axis.
  const pointsByPlayer =
    axisBy === "matches" ? histories.map((history) => rankHistoryPoints(history.matches ?? [])) : [];

  return (
    <Panel className={className}>
      {/* As tall as the weekly trend's header beside it (which holds a select), so the two plots start level. */}
      <PanelHeader size="sm" title="Rank over time" icon={Medal} className="min-h-11">
        {/* By date: when each climbed. By matches: how many ranked matches each climb took. */}
        <Segmented size="sm" width="hug" aria-label="Rank over" value={axisBy} onValueChange={setAxisBy}>
          <SegmentedItem value="date">Date</SegmentedItem>
          <SegmentedItem value="matches">Matches</SegmentedItem>
        </Segmented>
      </PanelHeader>
      {/* The plot takes whatever height its grid row gives the panel, from a compact minimum. */}
      <PanelBody size="sm" className="flex flex-1 flex-col">
        {/* The legend under the plot, as on the weekly trend beside it, so the pair lines up. */}
        <Stack gap={2} className="flex-1">
          {allFailed ? (
            <ChartError
              label={LABEL}
              onRetry={() => {
                for (const history of histories) if (history.isError) history.refetch();
              }}
            />
          ) : !settled ? (
            <ChartLoading label={LABEL} size="grow" />
          ) : axisBy === "date" ? (
            <RankHistoryChart players={players} ranks={ranks} filters={filters} daysByPlayer={daysByPlayer} />
          ) : (
            <RankByMatchChart players={players} ranks={ranks} pointsByPlayer={pointsByPlayer} />
          )}
          <ChartLegend label="Players">
            {players.map((player, index) => {
              // Who is missing from the chart, in the legend rather than a line under the plot, so this panel stays
              // as tall as the weekly trend beside it.
              const unranked = settled && !histories[index]?.isError && !daysByPlayer[index]?.length;
              return (
                <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                  <span className="max-w-full truncate">
                    {player.name}
                    {unranked && " · unranked"}
                  </span>
                </ChartLegendItem>
              );
            })}
          </ChartLegend>
        </Stack>
      </PanelBody>
    </Panel>
  );
}

function RankHistoryChart({
  players,
  ranks,
  filters,
  daysByPlayer,
}: {
  players: ComparedPlayer[];
  ranks: readonly Rank[] | undefined;
  filters: CompareFilters;
  daysByPlayer: ReturnType<typeof dailyRanks>[];
}) {
  const series = players.map((player, index) => ({ key: String(player.accountId), days: daysByPlayer[index] ?? [] }));
  const extent = rankDayExtent(series);
  const ranked = players.filter((_, index) => daysByPlayer[index]?.length);
  const unranked = players.filter((_, index) => !daysByPlayer[index]?.length);
  const unrankedNote =
    unranked.length > 0
      ? `${listNames(unranked.map((player) => player.name))} ${unranked.length === 1 ? "has" : "have"} no ranked matches in this range.`
      : null;

  if (!extent) {
    return <EmptyState variant="plain" icon={Medal} title="No ranked matches in this range" />;
  }

  const rows = mergeRankSeries(series);
  // From the first ranked day, not the filter's start: a long range with ranks only in its last weeks would leave most of
  // the plot empty. The end runs to the filter's end, where the last rank still holds.
  const start = extent[0];
  const end = Math.max(extent[1], filters.maxUnixTimestamp ? utcDay(filters.maxUnixTimestamp) : extent[1]);
  const axis = rankAxis(series.flatMap((s) => s.days.map((d) => d.linear)));
  const rankName = (badge: number) => badgeLabel(ranks, badge);
  const latest = players.flatMap((player, index) => {
    const last = daysByPlayer[index]?.at(-1);
    return last ? [`${player.name} ${rankName(last.badge)} on ${longDate(last.day)}`] : [];
  });
  const summary = `Rank over time from ${longDate(start)} to ${longDate(end)}, UTC. Latest ranks: ${latest.join("; ")}.${unrankedNote ? ` ${unrankedNote}` : ""}`;

  return (
    <Stack gap={2} className="flex-1">
      <ChartSurface label={summary} announce="label" size="grow" variant="flush">
        <LineChart data={rows} margin={CHART_MARGIN} accessibilityLayer={false}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            {...CHART_X_AXIS}
            dataKey="day"
            type="number"
            domain={[start, end]}
            ticks={dayTicks(start, end)}
            tickFormatter={shortDate}
            minTickGap={24}
          />
          <YAxis
            {...CHART_Y_AXIS}
            width={RANK_BADGE_NAME_AXIS_WIDTH}
            type="number"
            domain={axis.domain}
            ticks={axis.ticks}
            interval={0}
            allowDecimals={false}
            tick={<RankBadgeTick ranks={ranks} display="badge-name" />}
          />
          <Tooltip
            cursor={CHART_CURSOR_LINE}
            isAnimationActive={false}
            wrapperStyle={{ pointerEvents: "auto" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as RankRow | undefined;
              if (!active || !row) return null;
              return (
                <ChartReadings title={`${longDate(row.day)} (UTC)`} valueLabel="Rank" label="Ranks on this day">
                  {ranked.map((player) => {
                    const badge = row.badge[String(player.accountId)];
                    return (
                      <ChartReading key={player.accountId} label={player.name} color={player.color}>
                        {badge == null ? <NoValue /> : rankName(badge)}
                      </ChartReading>
                    );
                  })}
                </ChartReadings>
              );
            }}
          />
          {players.map((player) => {
            const key = String(player.accountId);
            return (
              <Line
                key={key}
                name={player.name}
                dataKey={(row: RankRow) => row.linear[key]}
                type="stepAfter"
                stroke={player.color}
                strokeWidth={2}
                isAnimationActive={false}
                activeDot={CHART_ACTIVE_DOT}
                dot={({ cx, cy, index, payload }: { cx?: number; cy?: number; index?: number; payload?: RankRow }) => (
                  <LoneDot key={index} cx={cx} cy={cy} color={player.color} lone={!!payload?.lone[key]} />
                )}
              />
            );
          })}
        </LineChart>
      </ChartSurface>
    </Stack>
  );
}

function RankByMatchChart({
  players,
  ranks,
  pointsByPlayer,
}: {
  players: ComparedPlayer[];
  ranks: readonly Rank[] | undefined;
  pointsByPlayer: ReturnType<typeof rankHistoryPoints>[];
}) {
  const series = players.map((player, index) => ({
    key: String(player.accountId),
    points: pointsByPlayer[index] ?? [],
  }));
  const rows = rankByMatchNumber(series);
  const last = rows.at(-1);
  if (!last) return <EmptyState variant="plain" icon={Medal} title="No ranked matches in this range" />;
  const axis = rankAxis(series.flatMap((s) => s.points.map((point) => point.linear)));
  const rankName = (badge: number) => badgeLabel(ranks, badge);
  const ranked = players.filter((_, index) => (pointsByPlayer[index]?.length ?? 0) > 0);
  const summary = `Rank by ranked match on these dates. ${ranked
    .map((player) => {
      const points = pointsByPlayer[players.indexOf(player)] ?? [];
      const first = points[0];
      const end = points.at(-1);
      return first && end
        ? `${player.name}: ${rankName(first.badge)} to ${rankName(end.badge)} in ${points.length} ranked matches`
        : player.name;
    })
    .join("; ")}.`;

  return (
    <Stack gap={2} className="flex-1">
      <ChartSurface label={summary} announce="label" size="grow" variant="flush">
        <LineChart data={rows} margin={CHART_MARGIN} accessibilityLayer={false}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            {...CHART_X_AXIS}
            dataKey="match"
            type="number"
            // A lone ranked match still gets an axis to sit on.
            domain={[1, Math.max(2, last.match)]}
            ticks={niceTicks(1, Math.max(2, last.match)).filter((tick) => tick >= 1 && tick <= Math.max(2, last.match))}
            tickFormatter={(match: number) => formatStatValue(match, "integer") ?? ""}
            minTickGap={24}
          />
          <YAxis
            {...CHART_Y_AXIS}
            width={RANK_BADGE_NAME_AXIS_WIDTH}
            type="number"
            domain={axis.domain}
            ticks={axis.ticks}
            interval={0}
            allowDecimals={false}
            tick={<RankBadgeTick ranks={ranks} display="badge-name" />}
          />
          <Tooltip
            cursor={CHART_CURSOR_LINE}
            isAnimationActive={false}
            wrapperStyle={{ pointerEvents: "auto" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as RankByMatchRow | undefined;
              if (!active || !row) return null;
              return (
                <ChartReadings
                  title={
                    formatStatValue(row.match, "integer") == null
                      ? "After a ranked match"
                      : `After ranked match ${formatStatValue(row.match, "integer")}`
                  }
                  valueLabel="Rank"
                  label="Ranks after this many ranked matches"
                >
                  {ranked.map((player) => {
                    const badge = row.badge[String(player.accountId)];
                    return (
                      <ChartReading key={player.accountId} label={player.name} color={player.color}>
                        {badge == null ? <NoValue /> : rankName(badge)}
                      </ChartReading>
                    );
                  })}
                </ChartReadings>
              );
            }}
          />
          {players.map((player, index) => {
            const key = String(player.accountId);
            // One ranked match is a point, not a line: drawn as a dot so it is not invisible.
            const lone = (pointsByPlayer[index]?.length ?? 0) === 1;
            return (
              <Line
                key={key}
                name={player.name}
                dataKey={(row: RankByMatchRow) => row.linear[key]}
                type="stepAfter"
                stroke={player.color}
                strokeWidth={2}
                dot={
                  lone
                    ? ({ cx, cy, index: at }: { cx?: number; cy?: number; index?: number }) => (
                        <LoneDot key={at} cx={cx} cy={cy} color={player.color} lone={at === 0} />
                      )
                    : false
                }
                isAnimationActive={false}
                activeDot={CHART_ACTIVE_DOT}
              />
            );
          })}
        </LineChart>
      </ChartSurface>
    </Stack>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
