import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { day } from "~/dayjs";
import type { ActivityBucket } from "~/lib/tracker/compute";

import { LOSS_COLOR, WIN_COLOR } from "../shared/colors";

interface ActivityDatum extends ActivityBucket {
  label: string;
}

function ActivityTooltipContent({ active, payload }: { active?: boolean; payload?: { payload: ActivityDatum }[] }) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 text-muted-foreground">Week of {bucket.label}</div>
      <div className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: WIN_COLOR }} />
        <span className="font-semibold text-popover-foreground">{bucket.wins}</span>
        <span className="text-muted-foreground">wins</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: LOSS_COLOR }} />
        <span className="font-semibold text-popover-foreground">{bucket.losses}</span>
        <span className="text-muted-foreground">losses</span>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function ActivityChart({ buckets }: { buckets: ActivityBucket[] }) {
  const data: ActivityDatum[] = useMemo(
    () => buckets.map((bucket) => ({ ...bucket, label: day.unix(bucket.weekStartUnix).format("MMM D") })),
    [buckets],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Activity</CardTitle>
          <CardDescription>Matches per week</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <LegendSwatch color={WIN_COLOR} label="Wins" />
          <LegendSwatch color={LOSS_COLOR} label="Losses" />
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
            No matches in the selected range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                minTickGap={32}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                width={28}
              />
              <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.35 }} content={<ActivityTooltipContent />} />
              <Bar
                dataKey="wins"
                stackId="matches"
                fill={WIN_COLOR}
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={20}
                isAnimationActive={false}
              />
              <Bar
                dataKey="losses"
                stackId="matches"
                fill={LOSS_COLOR}
                stroke="var(--card)"
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
