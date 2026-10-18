import { ChartGradientLegend } from "~/components/patterns/charts/ChartLegend";
import { ChartOverlayItem } from "~/components/patterns/charts/ChartOverlay";
import { chartRampCss } from "~/components/patterns/charts/theme";

import type { HeatmapViewMode } from "./heatmap-grid";

interface HeatmapLegendProps {
  viewMode: HeatmapViewMode;
  maxValue: number;
  /** The percentile the density scale tops out at; below 1 the hottest cells are capped at `maxValue`. */
  sensitivity: number;
}

/** What the colors measure in each view, printed before the scale. */
const SCALE_NAMES: Record<HeatmapViewMode, string> = {
  kills: "Kills",
  deaths: "Deaths",
  kd: "K/D",
  share: "Kill share",
};

/** A share ratio as a multiple of the hero's overall share: "0.5×", "2×". */
const ratio = (value: number) => `${Number(value.toFixed(value < 1 ? 2 : 1))}×`;

export function HeatmapLegend({ viewMode, maxValue, sensitivity }: HeatmapLegendProps) {
  if (viewMode === "share") {
    return (
      <ChartOverlayItem>
        <ChartGradientLegend
          stops={chartRampCss("diverging")}
          label={SCALE_NAMES.share}
          labelDisplay="visible"
          min={ratio(1 / maxValue)}
          mid={ratio(1)}
          max={ratio(maxValue)}
        />
      </ChartOverlayItem>
    );
  }
  return (
    <ChartOverlayItem>
      <ChartGradientLegend
        stops={chartRampCss("sequential")}
        label={SCALE_NAMES[viewMode]}
        labelDisplay="visible"
        clipped={sensitivity < 1}
        min="0"
        max={viewMode === "kd" ? maxValue.toFixed(2) : Math.round(maxValue).toLocaleString("en-US")}
      />
    </ChartOverlayItem>
  );
}
