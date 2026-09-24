import { useId } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { useSharedAxisWidth } from "~/components/patterns/charts/useSharedAxisWidth";
import { Card, CardContent } from "~/components/ui/card";
import { percentTicks, winRateDomain } from "~/lib/chart-axis";
import { formatPercent } from "~/lib/format";

const WIN_RATE_COLOR = CHART_COLOR.winRate;
const SHARE_COLOR = CHART_COLOR.share;

export interface WeekEntry {
  weekStart: number;
  label: string;
  winRate: number;
  /** Pick rate for a hero, purchase rate for an item; drawn in its own plot under the win rate. */
  share: number;
  matches: number;
}

export function WeeklyTrendChart({
  weeks,
  shareLabel,
  label,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "children" | "size"> & {
  weeks: WeekEntry[];
  shareLabel: string;
  label: string;
}) {
  const winRateAxis = winRateDomain(weeks.map((week) => week.winRate));
  const maxShare = Math.max(...weeks.map((week) => week.share));
  const shareStep = maxShare < 0.1 ? 0.01 : 0.1;
  const shareAxis: [number, number] = [0, Math.ceil(maxShare / shareStep) * shareStep];

  const syncId = useId();
  const { ref: plotsRef, width: axisWidth } = useSharedAxisWidth<HTMLDivElement>();
  const percentAxis = {
    ...CHART_Y_AXIS,
    tickFormatter: (v: number) => `${Math.round(v * 100)}%`,
    width: axisWidth,
  };

  // Two measures on different scales get a plot each, stacked on a shared week axis: a second y-axis would let
  // the reader compare heights that mean nothing.
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the tags it suggests (fieldset, details, optgroup) are none of them a chart
    <Card size="xs" role="group" aria-label={label} {...props}>
      <CardContent ref={plotsRef} className="flex flex-col gap-1">
        <ChartLegend>
          <ChartLegendItem color={WIN_RATE_COLOR} shape="line">
            Win rate
          </ChartLegendItem>
          <ChartLegendItem color={SHARE_COLOR} shape="line">
            {shareLabel}
          </ChartLegendItem>
        </ChartLegend>
        <ChartSurface label="Win rate by week" size="md" variant="bare">
          <LineChart data={weeks} syncId={syncId} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="label" {...CHART_X_AXIS} tick={false} height={4} />
            <YAxis domain={winRateAxis} ticks={percentTicks(winRateAxis)} {...percentAxis} />
            <ReferenceLine y={0.5} {...CHART_BASELINE} />
            <Tooltip
              wrapperStyle={{ pointerEvents: "auto" }}
              isAnimationActive={false}
              cursor={CHART_CURSOR_LINE}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0].payload as WeekEntry;
                return (
                  <ChartReadings title={`Week of ${entry.label}`}>
                    <ChartReading label="Win rate">{formatPercent(entry.winRate)}</ChartReading>
                    <ChartReading label={shareLabel}>{formatPercent(entry.share)}</ChartReading>
                    <ChartReading label="Matches">{entry.matches.toLocaleString("en-US")}</ChartReading>
                  </ChartReadings>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="winRate"
              stroke={WIN_RATE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: WIN_RATE_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartSurface>
        <ChartSurface label={`${shareLabel} by week`} size="sm" variant="bare">
          <LineChart data={weeks} syncId={syncId} margin={CHART_MARGIN}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="label" {...CHART_X_AXIS} />
            <YAxis domain={shareAxis} ticks={[shareAxis[0], shareAxis[1]]} {...percentAxis} />
            {/* The readings live in the plot above; here the synced cursor alone marks the week. */}
            <Tooltip isAnimationActive={false} cursor={CHART_CURSOR_LINE} content={() => null} />
            <Line
              type="monotone"
              dataKey="share"
              stroke={SHARE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartSurface>
      </CardContent>
    </Card>
  );
}
