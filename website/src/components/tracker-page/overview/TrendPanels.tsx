import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Activity, Medal } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import { day } from "~/dayjs";
import { extractBadgeMap } from "~/lib/leaderboard";
import type { Activity as MatchActivity, RankHistoryPoint } from "~/lib/tracker/compute";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { DashboardPanel } from "./DashboardPanel";
import { PerformanceTrendPanel } from "./PerformanceTrendPanel";

const axis = { fontSize: 9, fill: "var(--muted-foreground)" };
const dateLabel = (value: number) => day.unix(value).format("MMM D");
const rankConfig = { linear: { label: "Rank", color: "var(--chart-4)" } };
const activityConfig = {
  wins: { label: "Wins", color: "var(--victory)" },
  losses: { label: "Losses", color: "var(--primary)" },
};

export function TrendPanels({
  entries,
  ranks,
  activity,
}: {
  entries: PlayerMatchHistoryEntry[];
  ranks: RankHistoryPoint[];
  activity: MatchActivity;
}) {
  const { data: rankAssets = [] } = useQuery(ranksQueryOptions);
  const badgeMap = extractBadgeMap(rankAssets);
  const rankName = (badge: number) => {
    const info = badgeMap.get(badge);
    return info ? `${info.name} ${info.subtier}` : `Badge ${badge}`;
  };
  const latestRank = ranks.at(-1);
  return (
    <div className="grid gap-2 @3xl/overview:grid-cols-3">
      <PerformanceTrendPanel entries={entries} />
      <DashboardPanel title="Rank history" icon={Medal} meta={`${ranks.length} recorded`}>
        <div
          className="mb-1 truncate text-lg font-semibold"
          title={latestRank ? rankName(latestRank.badge) : undefined}
        >
          {latestRank ? rankName(latestRank.badge) : "Unranked"}
        </div>
        {ranks.length < 2 ? (
          <ChartEmpty text="Needs 2 matches with rank badges" />
        ) : (
          <ChartContainer
            config={rankConfig}
            className="aspect-auto h-24 w-full"
            aria-label="Rank progression over recorded matches"
          >
            <AreaChart data={ranks} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tickFormatter={dateLabel}
                tick={axis}
                axisLine={false}
                tickLine={false}
                minTickGap={35}
                height={18}
              />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => day.unix(payload[0].payload.time).format("MMM D, YYYY")}
                    formatter={(_value, _name, item) => <strong>{rankName(item.payload.badge)}</strong>}
                  />
                }
              />
              <Area
                dataKey="linear"
                type="stepAfter"
                stroke="var(--chart-4)"
                fill="var(--chart-4)"
                fillOpacity={0.1}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {ranks.length > 0
            ? `Peak: ${rankName(ranks.reduce((best, p) => (p.badge > best ? p.badge : best), 0))}`
            : "No rank badges in selected matches"}
        </p>
      </DashboardPanel>
      <DashboardPanel
        title="Match activity"
        icon={Activity}
        meta={activity.granularity === "week" ? "Weekly" : "Monthly"}
      >
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {activity.buckets.reduce((sum, b) => sum + b.wins + b.losses, 0).toLocaleString("en-US")}
          </span>
          <span className="text-[10px] text-muted-foreground">matches played</span>
        </div>
        <ChartContainer
          config={activityConfig}
          className="aspect-auto h-24 w-full"
          aria-label="Wins and losses by activity period"
        >
          <BarChart data={activity.buckets} margin={{ top: 4, right: 2, left: 2, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="bucketStartUnix"
              tickFormatter={dateLabel}
              tick={axis}
              axisLine={false}
              tickLine={false}
              minTickGap={35}
              height={18}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, payload) =>
                    `${activity.granularity === "week" ? "Week of " : ""}${day.unix(payload[0].payload.bucketStartUnix).format(activity.granularity === "week" ? "MMM D, YYYY" : "MMM YYYY")}`
                  }
                />
              }
            />
            <Bar dataKey="wins" stackId="activity" fill="var(--victory)" maxBarSize={20} isAnimationActive={false} />
            <Bar
              dataKey="losses"
              stackId="activity"
              fill="var(--primary)"
              radius={[2, 2, 0, 0]}
              maxBarSize={20}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
        <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-sm bg-victory" />
            Wins
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-sm bg-primary" />
            Losses
          </span>
        </div>
      </DashboardPanel>
    </div>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-24 items-center justify-center rounded border border-dashed px-4 text-center text-[11px] text-muted-foreground">
      {text}
    </div>
  );
}
