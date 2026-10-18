import { DefaultZIndexes, usePlotArea, useXAxisScale, ZIndexLayer } from "recharts";

import { CHART_MARKER_LABEL, CHART_MARKER_LINE } from "~/components/patterns/charts/theme";

export interface ChartMarker {
  /** Where on a numeric x-axis the event happened, in the axis' own unit (a timestamp in ms on a time axis). */
  at: number;
  /** The text drawn beside the line. */
  label: string;
  /** Drawn instead when `label` fits on neither side of the line (a narrow plot). */
  shortLabel?: string;
}

// Tick text is `--chart-tick` (0.75rem); a character is at most ~0.6em wide, so 7.5px keeps estimates on the safe side.
const CHAR_WIDTH = 7.5;
const LABEL_GAP = 8;
/** Label to line, and row to row. */
const LABEL_INSET = 4;
const ROW_HEIGHT = 16;

interface PlacedMarker {
  marker: ChartMarker;
  x: number;
  left?: number;
  row?: number;
  /** Where the text is drawn from: its start on the right of the line, its end on the left so it meets the line. */
  textX?: number;
  textAnchor?: "start" | "end";
  /** The text drawn: the label, or the short label when only that fits. */
  text?: string;
}

/**
 * Puts each label beside its line, on the right unless it would leave the plot, in the first row where it collides
 * with no other label. A label that fits on neither side falls back to its short label, and without one the line
 * stays unlabelled: a label is never drawn away from its line. Rows past `maxRows` would bury the series; those
 * markers keep their line alone.
 */
function placeLabels(markers: PlacedMarker[], minX: number, maxX: number, maxRows: number): PlacedMarker[] {
  const rows: [number, number][][] = [];
  for (const placed of [...markers].sort((a, b) => a.x - b.x)) {
    const side = (text: string) => {
      const width = text.length * CHAR_WIDTH;
      if (placed.x + LABEL_INSET + width <= maxX) return { text, width, onRight: true };
      if (placed.x - LABEL_INSET - width >= minX) return { text, width, onRight: false };
      return undefined;
    };
    const fit = side(placed.marker.label) ?? (placed.marker.shortLabel ? side(placed.marker.shortLabel) : undefined);
    if (!fit) continue;
    const left = fit.onRight ? placed.x + LABEL_INSET : placed.x - LABEL_INSET - fit.width;
    const right = left + fit.width;
    let row = rows.findIndex((taken) => !taken.some(([l, r]) => left < r + LABEL_GAP && right + LABEL_GAP > l));
    if (row < 0) row = rows.push([]) - 1;
    if (row >= maxRows) continue;
    rows[row].push([left, right]);
    placed.left = left;
    placed.row = row;
    placed.text = fit.text;
    // The width is an upper bound, so a label left of its line ends at the line rather than starting at the estimate.
    placed.textX = fit.onRight ? left : placed.x - LABEL_INSET;
    placed.textAnchor = fit.onRight ? "start" : "end";
  }
  return markers;
}

/**
 * Vertical lines at events on a numeric x-axis (patches on a time axis), each labelled beside its line. The first row
 * of labels sits in the chart's top margin, so give the chart `CHART_MARGIN_MARKED`; labels that collide stack into
 * further rows down over the plot, on a halo in the card color, up to a third of the plot's height. `labels={false}`
 * draws the lines alone, for the lower plots of a stack. Markers outside the axis domain are not drawn.
 */
export function ChartMarkers({ markers, labels = true }: { markers: readonly ChartMarker[]; labels?: boolean }) {
  const scale = useXAxisScale();
  const plot = usePlotArea();
  if (!scale || !plot) return null;

  const right = plot.x + plot.width;
  const visible = markers.flatMap((marker): PlacedMarker[] => {
    const x = scale(marker.at);
    return typeof x === "number" && x >= plot.x && x <= right ? [{ marker, x }] : [];
  });
  const maxRows = 1 + Math.floor(plot.height / 3 / ROW_HEIGHT);
  const placed = labels ? placeLabels(visible, plot.x, right, maxRows) : visible;

  return (
    <>
      <g data-slot="chart-markers" pointerEvents="none">
        {placed.map(({ marker, x }) => (
          <line key={marker.at} x1={x} x2={x} y1={plot.y} y2={plot.y + plot.height} {...CHART_MARKER_LINE} />
        ))}
      </g>
      {/* Above the series and their dots, so a label in a lower row stays readable on its halo. */}
      <ZIndexLayer zIndex={DefaultZIndexes.scatter + 1}>
        <g data-slot="chart-marker-labels" pointerEvents="none">
          {placed.map(({ marker, text, textX, textAnchor, row }) =>
            textX == null || row == null ? null : (
              <text
                key={marker.at}
                x={textX}
                y={plot.y - 6 + row * ROW_HEIGHT}
                {...CHART_MARKER_LABEL}
                textAnchor={textAnchor}
              >
                {text}
              </text>
            ),
          )}
        </g>
      </ZIndexLayer>
    </>
  );
}
