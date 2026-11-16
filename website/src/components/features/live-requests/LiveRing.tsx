import { Pie, PieChart } from "recharts";

import { ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { Text } from "~/components/ui/text";
import { formatShare } from "~/lib/format";

import { formatCompact } from "./format";

export interface LiveRingSlice {
  key: string;
  label: string;
  /** A CSS color, from `SERIES_COLORS`, `CHART_COLOR` or `LIVE_MAP_COLOR`. */
  color: string;
  /** Requests per second. */
  value: number;
}

interface LiveRingProps extends React.ComponentProps<"div"> {
  /** What the ring splits, for assistive technology: "Requests by where they are answered". */
  label: string;
  slices: LiveRingSlice[];
}

/** A split of the traffic as a ring, with its list beside it carrying the numbers: requests per second and share. */
export function LiveRing({ label, slices, ...props }: LiveRingProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  return (
    <div className="flex items-center gap-3" {...props}>
      <div className="aspect-square w-20 shrink-0">
        {/* A decorative ring: the list beside it carries the numbers, so the ring takes no tab stops. */}
        <ChartSurface
          label={`${label}: ${slices.map((s) => `${s.label} ${formatShare(s.value / total)}`).join(", ")}`}
          announce="label"
          size="fill"
          variant="bare"
        >
          <PieChart accessibilityLayer={false}>
            <Pie
              // Recharts colours each sector from its data point's `fill`.
              data={slices.map((slice) => Object.assign({ fill: slice.color }, slice))}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
              rootTabIndex={-1}
            />
          </PieChart>
        </ChartSurface>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <ChartSwatch color={slice.color} />
            <Text variant="caption" wrap="truncate" className="flex-1">
              {slice.label}
            </Text>
            <Text variant="caption" numeric="tabular">
              {formatCompact(slice.value)}/s
            </Text>
            <Text variant="caption" tone="muted" numeric="tabular" align="end" className="w-10">
              {formatShare(slice.value / total)}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}
