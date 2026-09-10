export interface RankTickTier {
  tier: number;
  name: string;
  image?: string;
}

/** X-axis tick for a chart keyed by rank tier: the tier's badge, or its name when there is no badge image. */
export function RankTierTick({
  x,
  y,
  payload,
  tiers,
  size,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
  tiers: readonly RankTickTier[];
  size: number;
}) {
  const entry = tiers.find((t) => t.tier === payload?.value);
  if (x === undefined || y === undefined || !entry) return null;
  return entry.image ? (
    <image href={entry.image} x={x - size / 2} y={y + 4} width={size} height={size}>
      <title>{entry.name}</title>
    </image>
  ) : (
    <text x={x} y={y + 16} textAnchor="middle" fontSize={11} fill="currentColor">
      {entry.name}
    </text>
  );
}

/** Shrinks the badges on narrow charts so a dozen of them don't overlap; 60px covers the y axis and margins. */
export function rankTickSize(chartWidth: number, tierCount: number): number {
  return chartWidth > 0 ? Math.max(18, Math.min(36, Math.floor((chartWidth - 60) / tierCount) - 4)) : 36;
}
