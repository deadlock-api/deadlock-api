import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartReadings } from "~/components/analytics/ChartReadings";
import { ChartSurface } from "~/components/analytics/ChartSurface";
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
  const maxShare = Math.max(...weeks.map((week) => week.share));
  const shareStep = maxShare < 0.1 ? 0.01 : 0.1;
  const shareAxis: [number, number] = [0, Math.ceil(maxShare / shareStep) * shareStep];

  return (
    <ChartSurface label={ariaLabel} className="sm:h-[280px]">
      <LineChart data={weeks} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          yAxisId="winRate"
          domain={winRateAxis}
          ticks={percentTicks(winRateAxis)}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          width={44}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 11 }}
        />
        <YAxis
          yAxisId="share"
          orientation="right"
          domain={shareAxis}
          ticks={percentTicks(shareAxis)}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          width={44}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 11 }}
        />
        <ReferenceLine yAxisId="winRate" y={0.5} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <Tooltip
          wrapperStyle={{ pointerEvents: "auto" }}
          isAnimationActive={false}
          cursor={{ stroke: "var(--muted-foreground)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const entry = payload[0].payload as WeekEntry;
            return (
              <ChartReadings
                title={`Week of ${entry.label}`}
                rows={[
                  { label: "Win rate", value: formatPercent(entry.winRate) },
                  { label: shareLabel, value: formatPercent(entry.share) },
                  { label: "Matches", value: entry.matches.toLocaleString("en-US") },
                ]}
              />
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
    </ChartSurface>
  );
}
