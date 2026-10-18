import { ChartGradientLegend } from "~/components/patterns/charts/ChartLegend";
import { ChartOverlayItem } from "~/components/patterns/charts/ChartOverlay";
import { chartRampCss } from "~/components/patterns/charts/theme";

import type { HeatmapViewMode } from "./heatmap-grid";

interface HeatmapLegendProps {
  viewMode: HeatmapViewMode;
  maxValue: number;
}

/** A share ratio as a multiple of the hero's overall share: "0.5×", "2×". */
const ratio = (value: number) => `${Number(value.toFixed(value < 1 ? 2 : 1))}×`;

export function HeatmapLegend({ viewMode, maxValue }: HeatmapLegendProps) {
  if (viewMode === "share") {
    return (
      <ChartOverlayItem>
        <ChartGradientLegend
          stops={chartRampCss("diverging")}
          label="Share of the kills against the hero's overall share"
          min={ratio(1 / maxValue)}
          max={ratio(maxValue)}
        />
      </ChartOverlayItem>
    );
  }
  return (
    <ChartOverlayItem>
      <ChartGradientLegend
        stops={chartRampCss("sequential")}
        min="0"
        max={viewMode === "kd" ? maxValue.toFixed(2) : Math.round(maxValue).toLocaleString("en-US")}
      />
    </ChartOverlayItem>
  );
}
