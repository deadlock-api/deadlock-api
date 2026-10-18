import { useChartWidth } from "recharts";

import { CHART_TICK } from "~/components/patterns/charts/theme";

interface RankTickTier {
  tier: number;
  name: string;
  image?: string;
}

/** The x-axis height a tick needs with its name under the badge. */
export const RANK_TICK_NAMED_HEIGHT = 60;

/** Shrinks the badges on narrow charts so a dozen of them don't overlap; 60px covers the y axis and margins. */
function rankTickSize(chartWidth: number, tierCount: number): number {
  return chartWidth > 0 ? Math.max(18, Math.min(36, Math.floor((chartWidth - 60) / tierCount) - 4)) : 36;
}

/**
 * X-axis tick for a chart keyed by rank tier: the tier's badge, or its name when there is no badge image. With
 * `name="visible"` the name is printed under the badge too, for a few bars that should read without a hover; the axis
 * then needs `RANK_TICK_NAMED_HEIGHT`.
 */
// Law 6 does not apply: Recharts supplies the props and renders this itself, so it must not spread unknown props.
export function RankTierTick({
  x,
  y,
  payload,
  tiers,
  name = "hidden",
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
  tiers: readonly RankTickTier[];
  name?: "hidden" | "visible";
}) {
  const chartWidth = useChartWidth() ?? 0;
  const size = rankTickSize(chartWidth, tiers.length);
  const entry = tiers.find((t) => t.tier === payload?.value);
  if (x === undefined || y === undefined || !entry) return null;
  if (entry.image && name === "visible") {
    return (
      <g>
        <image href={entry.image} x={x - size / 2} y={y + 4} width={size} height={size} />
        <text x={x} y={y + size + 18} textAnchor="middle" fontSize={CHART_TICK.fontSize} fill={CHART_TICK.fill}>
          {entry.name}
        </text>
      </g>
    );
  }
  return entry.image ? (
    <image href={entry.image} x={x - size / 2} y={y + 4} width={size} height={size}>
      <title>{entry.name}</title>
    </image>
  ) : (
    <text x={x} y={y + 16} textAnchor="middle" fontSize={CHART_TICK.fontSize} fill="currentColor">
      {entry.name}
    </text>
  );
}
