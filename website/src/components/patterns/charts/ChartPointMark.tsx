import type { SVGProps } from "react";

import { CHART_COLOR } from "~/components/patterns/charts/theme";

/** The shape of a point: a circle, or a triangle pointing the way its verdict goes. */
export type PointMarkShape = "circle" | "triangle-up" | "triangle-down";

/**
 * How a point that is above, close to or below a reference is drawn: color and shape together, so the verdict does
 * not rest on color alone (WCAG 1.4.1). The legend takes the same shape (`ChartSwatch shape`).
 */
export const VERDICT_MARK = {
  above: { color: CHART_COLOR.positive, shape: "triangle-up" },
  even: { color: CHART_COLOR.neutral, shape: "circle" },
  below: { color: CHART_COLOR.negative, shape: "triangle-down" },
} as const satisfies Record<string, { color: string; shape: PointMarkShape }>;

/** Half the 24px target a pressable point needs (WCAG 2.5.8): the invisible hit circle under the mark. */
export const POINT_HIT_RADIUS = 12;

// A triangle with the circle's area reads as the same size: its circumradius is about 1.3 times the circle's radius.
const TRIANGLE_SCALE = 1.3;
const SIN_60 = Math.sqrt(3) / 2;

function markPath(shape: PointMarkShape, cx: number, cy: number, r: number): string {
  if (shape === "circle") {
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  const R = r * TRIANGLE_SCALE;
  const dir = shape === "triangle-up" ? -1 : 1;
  // The centroid sits on the point, so the triangle's tip is R from it and its base R / 2 on the other side.
  return `M ${cx} ${cy + dir * R} L ${cx + R * SIN_60} ${cy - (dir * R) / 2} L ${cx - R * SIN_60} ${cy - (dir * R) / 2} Z`;
}

/**
 * One point of a scatter plot, as a Recharts `shape`: a circle or a triangle of radius `r`. `pressable` adds an
 * invisible hit circle of `POINT_HIT_RADIUS`, so a 9px dot is still a 24px target, and the pointer cursor (set by
 * `ChartSurface` on `[data-pressable]`, never inline). Fill, stroke and opacity are SVG props.
 */
export function ChartPointMark({
  cx,
  cy,
  r,
  shape = "circle",
  pressable = false,
  ...props
}: Omit<SVGProps<SVGPathElement>, "d" | "cx" | "cy" | "r"> & {
  cx: number;
  cy: number;
  r: number;
  shape?: PointMarkShape;
  pressable?: boolean;
}) {
  return (
    <g data-slot="chart-point-mark" data-shape={shape} data-pressable={pressable || undefined}>
      {/* The hit area: never painted, it only takes the pointer. */}
      {pressable && <circle cx={cx} cy={cy} r={POINT_HIT_RADIUS} fill="none" pointerEvents="all" />}
      <path d={markPath(shape, cx, cy, r)} {...props} />
    </g>
  );
}
