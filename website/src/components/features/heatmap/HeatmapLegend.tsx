import { ChartGradientLegend } from "~/components/patterns/charts/ChartLegend";
import { ChartOverlayItem } from "~/components/patterns/charts/ChartOverlay";

import { GRADIENT_STOPS } from "./heatmap-grid";

// The first stop is the near-black the canvas draws as "no data", so the scale starts at the second.
const LEGEND_STOPS = GRADIENT_STOPS.slice(1).map(({ r, g, b }) => `rgb(${r},${g},${b})`);

interface HeatmapLegendProps {
  viewMode: "kills" | "deaths" | "kd";
  maxValue: number;
}

export function HeatmapLegend({ viewMode, maxValue }: HeatmapLegendProps) {
  return (
    <ChartOverlayItem>
      <ChartGradientLegend
        stops={LEGEND_STOPS}
        min="0"
        max={viewMode === "kd" ? maxValue.toFixed(2) : Math.round(maxValue).toLocaleString("en-US")}
      />
    </ChartOverlayItem>
  );
}
