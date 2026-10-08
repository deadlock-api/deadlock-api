import { CHART_COLOR } from "~/components/patterns/charts/theme";

/**
 * A line's dot where a point has no neighbour to join (a lone week, a lone day, a lone ranked match), so it is not
 * invisible; nothing elsewhere. Return it from a Recharts `dot` function, keyed by the point's index.
 */
export function LoneDot({ cx, cy, color, lone }: { cx?: number; cy?: number; color: string; lone: boolean }) {
  return lone && cx != null && cy != null ? (
    <circle cx={cx} cy={cy} r={4} fill={color} stroke={CHART_COLOR.surface} strokeWidth={2} />
  ) : (
    <g />
  );
}
