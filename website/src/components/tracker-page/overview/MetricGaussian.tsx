import type { HashMapValue } from "deadlock_api_client";
import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ChartContainer } from "~/components/ui/chart";
import { buildGaussianComparison } from "~/lib/tracker/gaussian";

const config = {
  player: { label: "Player", color: "var(--chart-4)" },
  cohort: { label: "Rank group", color: "var(--muted-foreground)" },
};

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
      <div className="flex h-20 items-center justify-center text-[10px] text-muted-foreground">
        Distribution unavailable
      </div>
    );

  return (
    <figure
      className="relative"
      aria-label={`${label}: Gaussian approximations. Player mean ${format(player?.avg ?? NaN)}, rank-group mean ${format(cohort?.avg ?? NaN)}. Vertical lines mark the means.`}
    >
      <ChartContainer config={config} className="aspect-auto h-20 w-full">
        <AreaChart data={curve.points} margin={{ top: 4, right: 12, bottom: 0, left: 12 }} accessibilityLayer={false}>
          <XAxis
            type="number"
            dataKey="x"
            domain={[curve.min, curve.max]}
            ticks={[curve.min, (curve.min + curve.max) / 2, curve.max]}
            tickFormatter={format}
            tick={{ fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            height={16}
            minTickGap={20}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Area
            dataKey="cohort"
            type="monotone"
            stroke="var(--color-cohort)"
            strokeDasharray="3 2"
            fill="var(--color-cohort)"
            fillOpacity={0.12}
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="player"
            type="monotone"
            stroke="var(--color-player)"
            fill="var(--color-player)"
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          {cohort?.avg != null && Number.isFinite(cohort.avg) && (
            <ReferenceLine x={cohort.avg} stroke="var(--color-cohort)" strokeDasharray="3 2" />
          )}
          {player?.avg != null && Number.isFinite(player.avg) && (
            <ReferenceLine x={player.avg} stroke="var(--color-player)" />
          )}
        </AreaChart>
      </ChartContainer>
      {!curve.hasSpread && (
        <span className="absolute inset-x-0 top-2 text-center text-[9px] text-muted-foreground">
          No spread recorded · means only
        </span>
      )}
    </figure>
  );
}
