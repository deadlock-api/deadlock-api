import type { HashMapValue } from "deadlock_api_client";
import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_X_AXIS_SM, SERIES_COLORS } from "~/components/patterns/charts/theme";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { buildGaussianComparison } from "~/lib/tracker/gaussian";

const PLAYER_COLOR = SERIES_COLORS[3];
const COHORT_COLOR = CHART_COLOR.neutral;

export function MetricGaussian({
  player,
  cohort,
  label,
  format,
  bounded,
}: {
  player?: HashMapValue;
  cohort?: HashMapValue;
  label: string;
  format: (value: number) => string;
  bounded: boolean;
}) {
  const curve = useMemo(
    () => buildGaussianComparison(player, cohort, bounded ? 1 : Infinity),
    [player, cohort, bounded],
  );
  if (!curve)
    return (
      <EmptyState
        variant="inline"
        className="flex h-20 items-center justify-center py-0 text-3xs"
        title="Distribution unavailable"
      />
    );

  return (
    <div className="relative">
      <ChartSurface
        label={`${label}: Gaussian approximations. Player mean ${format(player?.avg ?? NaN)}, lobby mean ${format(cohort?.avg ?? NaN)}. Vertical lines mark the means.`}
        size="xs"
        variant="bare"
      >
        <AreaChart data={curve.points} margin={{ top: 4, right: 12, bottom: 0, left: 12 }} accessibilityLayer={false}>
          <XAxis
            {...CHART_X_AXIS_SM}
            type="number"
            dataKey="x"
            domain={[curve.min, curve.max]}
            ticks={[curve.min, (curve.min + curve.max) / 2, curve.max]}
            tickFormatter={format}
            minTickGap={20}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Area
            dataKey="cohort"
            type="monotone"
            stroke={COHORT_COLOR}
            strokeDasharray="3 2"
            fill={COHORT_COLOR}
            fillOpacity={0.12}
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="player"
            type="monotone"
            stroke={PLAYER_COLOR}
            fill={PLAYER_COLOR}
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {cohort?.avg != null && Number.isFinite(cohort.avg) && (
            <ReferenceLine x={cohort.avg} stroke={COHORT_COLOR} strokeDasharray="3 2" />
          )}
          {player?.avg != null && Number.isFinite(player.avg) && <ReferenceLine x={player.avg} stroke={PLAYER_COLOR} />}
        </AreaChart>
      </ChartSurface>
      {!curve.hasSpread && (
        <span className="absolute inset-x-0 top-2 text-center text-4xs text-muted-foreground">
          No spread recorded · means only
        </span>
      )}
    </div>
  );
}
