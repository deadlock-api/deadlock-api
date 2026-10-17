import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_X_AXIS, SERIES_COLORS } from "~/components/patterns/charts/theme";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { buildGaussianComparison, type GaussianStats } from "~/lib/gaussian";
import { cn } from "~/lib/utils";

const VALUE_COLOR = SERIES_COLORS[3];
const REFERENCE_COLOR = CHART_COLOR.neutral;

const formatTick = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * Two distributions as normal curves fitted to their mean and standard deviation: the subject's (`value`, in a series
 * color) over a reference's (dashed, neutral), each with a line at its mean. The curves are approximations from two
 * moments, not measured histograms. `bounded` keeps a rate's axis under 1.
 */
export function GaussianComparison({
  value,
  reference,
  label,
  format = formatTick,
  bounded = false,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** The subject's mean (`avg`) and standard deviation (`std`). */
  value?: GaussianStats;
  /** What the subject is compared with: a lobby, a hero's average. */
  reference?: GaussianStats;
  /** Names the plot for screen readers: "Kills of this build against the hero". */
  label?: string;
  /** Prints the axis ticks. */
  format?: (value: number) => string;
  bounded?: boolean;
}) {
  const curve = useMemo(
    () => buildGaussianComparison(value, reference, bounded ? 1 : Infinity),
    [value, reference, bounded],
  );
  if (!curve) {
    return (
      <EmptyState
        variant="inline"
        className={cn("flex h-20 items-center justify-center py-0 text-xs", className)}
        title="Distribution unavailable"
      />
    );
  }
  const summary = `${label ?? "Distribution"}: mean ${value?.avg != null ? format(value.avg) : "unknown"} against ${
    reference?.avg != null ? format(reference.avg) : "unknown"
  }.`;

  return (
    <div data-slot="gaussian-comparison" className={cn("relative", className)} {...props}>
      <ChartSurface label={summary} announce="label" size="xs" variant="bare">
        <AreaChart data={curve.points} margin={{ top: 4, right: 12, bottom: 0, left: 12 }} accessibilityLayer={false}>
          <XAxis
            {...CHART_X_AXIS}
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
            stroke={REFERENCE_COLOR}
            strokeDasharray="3 2"
            fill={REFERENCE_COLOR}
            fillOpacity={0.12}
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="player"
            type="monotone"
            stroke={VALUE_COLOR}
            fill={VALUE_COLOR}
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {reference?.avg != null && Number.isFinite(reference.avg) && (
            <ReferenceLine x={reference.avg} stroke={REFERENCE_COLOR} strokeDasharray="3 2" />
          )}
          {value?.avg != null && Number.isFinite(value.avg) && <ReferenceLine x={value.avg} stroke={VALUE_COLOR} />}
        </AreaChart>
      </ChartSurface>
      {!curve.hasSpread && (
        <span className="absolute inset-x-0 top-2 text-center text-xs text-muted-foreground">Means only</span>
      )}
    </div>
  );
}

/** The colors of the two curves, for a legend beside the plot. */
export const GAUSSIAN_COLORS = { value: VALUE_COLOR, reference: REFERENCE_COLOR } as const;
