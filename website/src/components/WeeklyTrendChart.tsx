import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { percentTicks, winRateDomain } from "~/lib/chart-axis";
import { formatPercent } from "~/lib/format";

const WIN_RATE_COLOR = "#f59e0b";
const SHARE_COLOR = "#0284c7";

export interface WeekEntry {
  weekStart: number;
  label: string;
  winRate: number;
  /** Pick rate for a hero, purchase rate for an item; drawn as the dashed line on the right axis. */
  share: number;
  matches: number;
}

export function WeeklyTrendChart({
  weeks,
  shareLabel,
  ariaLabel,
}: {
  weeks: WeekEntry[];
  shareLabel: string;
  ariaLabel: string;
}) {
  const winRateAxis = winRateDomain(weeks.map((week) => week.winRate));
  const shareAxis: [number, number] = [0, Math.ceil(Math.max(...weeks.map((week) => week.share)) * 10) / 10];

  return (
    <figure aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={280} className="rounded-xl bg-muted p-2">
        <LineChart data={weeks} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="winRate"
            domain={winRateAxis}
            ticks={percentTicks(winRateAxis)}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            width={44}
            stroke="#525252"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="share"
            orientation="right"
            domain={shareAxis}
            ticks={percentTicks(shareAxis)}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            width={44}
            stroke="#525252"
            tick={{ fontSize: 11 }}
          />
          <ReferenceLine yAxisId="winRate" y={0.5} stroke="#525252" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: "#525252" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const entry = payload[0].payload as WeekEntry;
              return (
                <div className="rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
                  <div className="font-medium">Week of {entry.label}</div>
                  <div className="text-muted-foreground">
                    Win rate {formatPercent(entry.winRate)} · {shareLabel} {formatPercent(entry.share)} ·{" "}
                    {entry.matches.toLocaleString("en-US")} matches
                  </div>
                </div>
              );
            }}
          />
          <Line
            yAxisId="winRate"
            type="monotone"
            dataKey="winRate"
            stroke={WIN_RATE_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: WIN_RATE_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="share"
            type="monotone"
            dataKey="share"
            stroke={SHARE_COLOR}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
