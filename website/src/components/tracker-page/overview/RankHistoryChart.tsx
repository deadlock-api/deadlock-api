import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { day } from "~/dayjs";
import { extractBadgeMap, type SubtierInfo } from "~/lib/leaderboard";
import { linearToBadge, type RankHistoryPoint } from "~/lib/tracker/compute";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { RANK_LINE_COLOR } from "../shared/colors";

function badgeLabel(info: SubtierInfo | undefined, badge: number, withSubtier: boolean): string {
  if (!info) return String(badge);
  return withSubtier ? `${info.name} ${info.subtier}` : info.name;
}

/** Recharts wraps tick text at spaces; a no-break space keeps "Phantom 1" on one line. */
function badgeTickLabel(info: SubtierInfo | undefined, badge: number, withSubtier: boolean): string {
  return badgeLabel(info, badge, withSubtier).replace(" ", "\u00A0");
}

function RankTooltipContent({
  active,
  payload,
  badgeMap,
}: {
  active?: boolean;
  payload?: { payload: RankHistoryPoint }[];
  badgeMap: Map<number, SubtierInfo>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-sm font-semibold text-popover-foreground">
        {badgeLabel(badgeMap.get(point.badge), point.badge, true)}
      </div>
      <div className="mt-0.5 text-muted-foreground">{day.unix(point.time).format("MMM D, YYYY · HH:mm")}</div>
      {point.delta != null && point.delta !== 0 && (
        <div className="text-muted-foreground">Progress {point.delta > 0 ? `+${point.delta}` : point.delta}</div>
      )}
    </div>
  );
}

export function RankHistoryChart({ points }: { points: RankHistoryPoint[] }) {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const badgeMap = useMemo(() => extractBadgeMap(ranks ?? []), [ranks]);

  const { domainMin, domainMax, ticks } = useMemo(() => {
    if (points.length === 0) return { domainMin: 0, domainMax: 1, ticks: [] as number[] };
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      min = Math.min(min, point.linear);
      max = Math.max(max, point.linear);
    }
    const lower = Math.max(1, min - 1);
    const upper = max + 1;
    // Prefer one tick per tier boundary; within a single tier fall back to subtier ticks.
    const tierTicks: number[] = [];
    for (let tier = 1; tier <= 12; tier++) {
      const linear = (tier - 1) * 6 + 1;
      if (linear >= lower && linear <= upper) tierTicks.push(linear);
    }
    const allTicks =
      tierTicks.length >= 2
        ? tierTicks
        : Array.from({ length: Math.floor(upper) - Math.ceil(lower) + 1 }, (_, i) => Math.ceil(lower) + i);
    return { domainMin: lower, domainMax: upper, ticks: allTicks };
  }, [points]);

  const showSubtierTicks = ticks.length > 0 && ticks[0] % 6 !== 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rank progression</CardTitle>
        <CardDescription>Badge after each ranked match</CardDescription>
      </CardHeader>
      <CardContent>
        {points.length < 2 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No ranked matches in the selected range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => day.unix(value).format("MMM D")}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                minTickGap={48}
              />
              <YAxis
                dataKey="linear"
                type="number"
                domain={[domainMin, domainMax]}
                ticks={ticks}
                tickFormatter={(value: number) =>
                  badgeTickLabel(badgeMap.get(linearToBadge(value)), linearToBadge(value), showSubtierTicks)
                }
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                width={76}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<RankTooltipContent badgeMap={badgeMap} />}
              />
              <Area
                type="monotone"
                dataKey="linear"
                stroke={RANK_LINE_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
                fill={RANK_LINE_COLOR}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: RANK_LINE_COLOR }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
