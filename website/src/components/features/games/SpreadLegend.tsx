import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { CHART_COLOR } from "~/components/patterns/charts/theme";

/**
 * The key to an average line with its ±1 std dev band (`CHART_SPREAD_BAND`). It names the shaded band where a panel
 * description used to explain it, and it renders in every chart state, so the panel keeps its height while loading.
 */
export function SpreadLegend({
  label,
  average,
  color = CHART_COLOR.primary,
  className,
}: {
  /** What the chart shows, the name of the legend. */
  label: string;
  /** The average line's name. */
  average: string;
  color?: string;
  className?: string;
}) {
  return (
    <ChartLegend label={`${label.charAt(0).toUpperCase()}${label.slice(1)} key`} className={className}>
      <ChartLegendItem color={color} shape="line">
        {average}
      </ChartLegendItem>
      <ChartLegendItem color={color} shape="band">
        ±1 std dev
      </ChartLegendItem>
    </ChartLegend>
  );
}
