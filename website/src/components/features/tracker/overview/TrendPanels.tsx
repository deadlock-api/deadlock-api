import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Activity, Medal } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { RankDelta } from "~/components/features/tracker/shared/RankDelta";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_AXIS_SM,
  CHART_COLOR,
  CHART_CURSOR_BAND,
  CHART_CURSOR_LINE,
  CHART_GRID,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import {
  Tooltip as HoverTooltip,
  TooltipCard,
  TooltipHeader,
  TooltipStat,
  TooltipStats,
} from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { extractBadgeMap } from "~/lib/leaderboard";
import type { Activity as MatchActivity, RankHistoryPoint, ResultFilter } from "~/lib/tracker/compute";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { PerformanceTrendPanel } from "./PerformanceTrendPanel";
import { ActivityTable, RankHistoryTable } from "./TrendDataTables";

const dateLabel = (value: number) => day.unix(value).format("MMM D");
const RANK_COLOR = SERIES_COLORS[3];

export function TrendPanels({
  entries,
  ranks,
  activity,
  result,
  onOpenMatch,
  onSelectPeriod,
}: {
  entries: PlayerMatchHistoryEntry[];
  ranks: RankHistoryPoint[];
  activity: MatchActivity;
  result: ResultFilter;
  onOpenMatch: (matchId: number) => void;
  onSelectPeriod: (bucketStartUnix: number, granularity: MatchActivity["granularity"]) => void;
}) {
  const { data: rankAssets = [] } = useQuery(ranksQueryOptions);
  const badgeMap = extractBadgeMap(rankAssets);
  const rankName = (badge: number) => {
    const info = badgeMap.get(badge);
    return info ? `${info.name} ${info.subtier}` : `Badge ${badge}`;
  };
  const latestRank = ranks.at(-1);
  const [rankHistoryOpen, setRankHistoryOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  return (
    <div className="grid gap-2 @xl/overview:grid-cols-2 @3xl/overview:grid-cols-3">
      <PerformanceTrendPanel
        entries={entries}
        result={result}
        className="@xl/overview:col-span-2 @3xl/overview:col-span-1"
      />
      <PanelWithDetails
        title="Rank history"
        icon={Medal}
        meta={`${ranks.length} recorded`}
        open={rankHistoryOpen}
        onOpenChange={setRankHistoryOpen}
        details={
          <RankHistoryTable
            ranks={ranks}
            rankName={rankName}
            onOpenMatch={(matchId) => {
              setRankHistoryOpen(false);
              onOpenMatch(matchId);
            }}
          />
        }
      >
        <HoverTooltip
          content={
            <TooltipHeader
              title={latestRank ? rankName(latestRank.badge) : "No recorded rank"}
              subtitle="Latest recorded rank"
            />
          }
        >
          <div className="truncate text-lg font-semibold">
            {latestRank ? rankName(latestRank.badge) : "No recorded rank"}
          </div>
        </HoverTooltip>
        {ranks.length < 2 ? (
          <EmptyState
            variant="inline"
            className="flex h-24 items-center justify-center py-0 text-xs"
            title="Needs 2 matches with rank badges"
          />
        ) : (
          <ChartSurface label="Rank progression over recorded matches" size="sm" variant="bare">
            <AreaChart
              data={ranks}
              margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
              aria-label="Rank progression over recorded matches"
            >
              <CartesianGrid {...CHART_GRID} />
              <XAxis {...CHART_AXIS_SM} dataKey="time" tickFormatter={dateLabel} minTickGap={35} height={18} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
              <Tooltip cursor={CHART_CURSOR_LINE} content={<RankTooltip rankName={rankName} />} />
              <Area
                dataKey="linear"
                type="stepAfter"
                stroke={RANK_COLOR}
                fill={RANK_COLOR}
                fillOpacity={0.1}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartSurface>
        )}
        <p className="text-3xs text-muted-foreground">
          {ranks.length > 0
            ? `Peak: ${rankName(ranks.reduce((best, p) => (p.badge > best ? p.badge : best), 0))}`
            : "No rank badges in selected matches"}
        </p>
      </PanelWithDetails>
      <PanelWithDetails
        title="Match activity"
        icon={Activity}
        meta={activity.granularity === "week" ? "Weekly" : "Monthly"}
        open={activityOpen}
        onOpenChange={setActivityOpen}
        details={
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {result === "all" ? "Wins and losses" : result === "win" ? "Wins only" : "Losses only"} in your selected
              hero, mode and date range.
            </p>
            <ActivityTable
              activity={activity}
              onSelectPeriod={(bucketStartUnix) => {
                setActivityOpen(false);
                onSelectPeriod(bucketStartUnix, activity.granularity);
              }}
            />
          </div>
        }
      >
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {activity.buckets.reduce((sum, b) => sum + b.wins + b.losses, 0).toLocaleString("en-US")}
          </span>
          <span className="text-3xs text-muted-foreground">matches played</span>
        </div>
        <ChartSurface label="Wins and losses by activity period" size="sm" variant="bare">
          <BarChart
            data={activity.buckets}
            margin={{ top: 4, right: 2, left: 2, bottom: 0 }}
            barCategoryGap="25%"
            aria-label="Wins and losses by activity period"
          >
            <CartesianGrid {...CHART_GRID} />
            <XAxis {...CHART_AXIS_SM} dataKey="bucketStartUnix" tickFormatter={dateLabel} minTickGap={35} height={18} />
            <YAxis hide />
            <Tooltip cursor={CHART_CURSOR_BAND} content={<ActivityTooltip granularity={activity.granularity} />} />
            <Bar
              dataKey="wins"
              stackId="activity"
              fill={CHART_COLOR.positive}
              maxBarSize={20}
              isAnimationActive={false}
            />
            <Bar
              dataKey="losses"
              stackId="activity"
              fill={CHART_COLOR.negative}
              radius={[2, 2, 0, 0]}
              maxBarSize={20}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartSurface>
        <ChartLegend size="sm">
          <ChartLegendItem color={CHART_COLOR.positive}>Wins</ChartLegendItem>
          <ChartLegendItem color={CHART_COLOR.negative}>Losses</ChartLegendItem>
        </ChartLegend>
      </PanelWithDetails>
    </div>
  );
}

function RankTooltip({
  active,
  payload,
  rankName,
}: {
  active?: boolean;
  payload?: { payload: RankHistoryPoint }[];
  rankName: (badge: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <TooltipCard>
      <TooltipHeader title={rankName(point.badge)} subtitle={day.unix(point.time).format("MMM D, YYYY · HH:mm")} />
      <TooltipStats>
        <TooltipStat label="Match" value={point.matchId} />
        <TooltipStat
          label="Rank progress"
          value={point.delta == null ? "—" : point.delta === 0 ? "0" : <RankDelta value={point.delta} />}
        />
      </TooltipStats>
    </TooltipCard>
  );
}

function ActivityTooltip({
  active,
  payload,
  granularity,
}: {
  active?: boolean;
  payload?: { payload: MatchActivity["buckets"][number] }[];
  granularity: MatchActivity["granularity"];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const total = point.wins + point.losses;
  return (
    <TooltipCard>
      <TooltipHeader
        title={`${granularity === "week" ? "Week of " : ""}${day.unix(point.bucketStartUnix).format(granularity === "week" ? "MMM D, YYYY" : "MMM YYYY")}`}
        subtitle="Match activity"
      />
      <TooltipStats>
        <TooltipStat label="Wins" value={point.wins} className="text-positive" />
        <TooltipStat label="Losses" value={point.losses} className="text-negative" />
        <TooltipStat label="Win rate" value={total > 0 ? `${Math.round((point.wins / total) * 100)}%` : "—"} />
      </TooltipStats>
    </TooltipCard>
  );
}
