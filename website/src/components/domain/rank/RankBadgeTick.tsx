import type { Rank } from "deadlock_api_client";

import { CHART_TICK } from "~/components/patterns/charts/theme";
import { badgeLabel, getRankImageUrl } from "~/lib/rank-utils";
import { linearToBadge } from "~/lib/tracker/compute";

/** The badge's side in px; give the y axis `width={RANK_BADGE_AXIS_WIDTH}`. */
const BADGE_SIZE = 20;
export const RANK_BADGE_AXIS_WIDTH = BADGE_SIZE + 8;
/** The y axis width for `display="badge-name"`: the badge and a rank name such as "Ascendant 6" beside it. */
export const RANK_BADGE_NAME_AXIS_WIDTH = BADGE_SIZE + 92;

/**
 * Y-axis tick for a chart whose values are linearised badges (`badgeToLinear`): the subtier's badge, named in its
 * title, or the badge's short number while the ranks load. `display="badge-name"` also writes the rank's name beside
 * the badge, for a chart wide enough to spare the axis room (`RANK_BADGE_NAME_AXIS_WIDTH`).
 */
// Law 6 does not apply: Recharts supplies the props and renders this itself, so it must not spread unknown props.
export function RankBadgeTick({
  x,
  y,
  payload,
  ranks,
  display = "badge",
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
  ranks: readonly Rank[] | undefined;
  display?: "badge" | "badge-name";
}) {
  if (x === undefined || y === undefined || payload === undefined) return null;
  const badge = linearToBadge(payload.value);
  const tier = Math.floor(badge / 10);
  const rank = ranks?.find((r) => r.tier === tier);
  const image = getRankImageUrl(rank, "webp", badge % 10);
  const label = badgeLabel(ranks, badge);
  if (image && display === "badge-name") {
    return (
      <g>
        <title>{label}</title>
        <text
          x={x - BADGE_SIZE - 6}
          y={y}
          dy="0.35em"
          textAnchor="end"
          fontSize={CHART_TICK.fontSize}
          fill={CHART_TICK.fill}
        >
          {label}
        </text>
        <image href={image} x={x - BADGE_SIZE - 2} y={y - BADGE_SIZE / 2} width={BADGE_SIZE} height={BADGE_SIZE} />
      </g>
    );
  }
  return image ? (
    <image href={image} x={x - BADGE_SIZE - 2} y={y - BADGE_SIZE / 2} width={BADGE_SIZE} height={BADGE_SIZE}>
      <title>{label}</title>
    </image>
  ) : (
    <text
      x={x - 2}
      y={y}
      dy="0.35em"
      textAnchor="end"
      fontSize={CHART_TICK.fontSize}
      fill={CHART_TICK.fill}
      className="tabular-nums"
    >
      <title>{label}</title>
      {`${tier}.${badge % 10}`}
    </text>
  );
}
