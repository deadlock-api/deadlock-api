import type { Rank } from "deadlock_api_client";
import { useId } from "react";
import { DefaultZIndexes, usePlotArea, useXAxisScale, ZIndexLayer } from "recharts";

import { CHART_TICK } from "~/components/patterns/charts/theme";

const ICON_SIZE = 48;
const AXIS_GAP = 4;
/** X axis height that fits the badges; pass it to the chart's `<XAxis height>`. */
export const RANK_ICON_AXIS_HEIGHT = ICON_SIZE + 2 * AXIS_GAP;
const NAME_GAP = 8;
const NAME_LINE = 20;
/** X axis height that fits the badges and the names under them (`display="icon-name"`). */
export const RANK_ICON_NAME_AXIS_HEIGHT = RANK_ICON_AXIS_HEIGHT + NAME_GAP + NAME_LINE;
/** The narrowest tier that still gets its name; narrower (a phone), only the badges stay and their title names them. */
const NAME_MIN_WIDTH = 64;

interface TierSpan {
  tier: number;
  firstBadge: number;
  lastBadge: number;
}

interface RankTierIconsProps {
  tiers: TierSpan[];
  ranks: ReadonlyMap<number, Rank>;
  /**
   * `icon` (default): the badge alone; the XAxis takes `RANK_ICON_AXIS_HEIGHT`. `icon-name`: the rank's name centred
   * under each badge while every tier is wide enough for it; the XAxis takes `RANK_ICON_NAME_AXIS_HEIGHT`.
   */
  display?: "icon" | "icon-name";
}

/**
 * Each rank tier's badge, drawn under its subtier bars in the x axis band, where it can't hide a short bar. Give the
 * chart's `<XAxis>` a height of `RANK_ICON_AXIS_HEIGHT` to make room. Render it as a direct child of a chart whose
 * x axis is keyed by badge (`tier * 10 + subtier`); it reads the axis scale and plot area from the chart context.
 */
// Law 6 does not apply: it draws an SVG layer inside a Recharts chart from the chart context, so it spreads no props.
export function RankTierIcons({ tiers, ranks, display = "icon" }: RankTierIconsProps) {
  const scale = useXAxisScale();
  const plot = usePlotArea();
  // React's ids contain characters that break a `url(#...)` reference.
  const filterId = `rank-icon-shadow-${useId().replace(/[^\w-]/g, "")}`;
  if (!scale || !plot) return null;

  const axisY = plot.y + plot.height;
  // Names show on every tier or on none, measured on the narrowest tier: the bars' width times their count.
  const showNames =
    display === "icon-name" &&
    tiers.every(({ firstBadge, lastBadge }) => {
      const first = scale(firstBadge, { position: "middle" });
      const last = scale(lastBadge, { position: "middle" });
      if (first == null || last == null || lastBadge === firstBadge) return false;
      const barWidth = (last - first) / (lastBadge - firstBadge);
      return barWidth * (lastBadge - firstBadge + 1) >= NAME_MIN_WIDTH;
    });
  const nameY = axisY + RANK_ICON_AXIS_HEIGHT + NAME_GAP;
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.bar + 1}>
      <g style={{ pointerEvents: "none" }}>
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="black" floodOpacity="0.7" />
          </filter>
        </defs>
        {tiers.map(({ tier, firstBadge, lastBadge }) => {
          const first = scale(firstBadge, { position: "middle" });
          const last = scale(lastBadge, { position: "middle" });
          const rank = ranks.get(tier);
          const imageUrl = rank?.images?.large_webp ?? rank?.images?.large;
          if (first == null || last == null || !imageUrl) return null;

          // Shrink to the tier's width on narrow charts. The source images carry different transparent padding: the
          // factors bring each badge's art to about the same size (measured 2026-10; Oracle's art fills its image).
          const baseSize = Math.min(ICON_SIZE, (last - first) * 1.2);
          const size = baseSize * (tier === 8 ? 1 : tier === 9 ? 1.6 : tier >= 10 ? 1.4 : 1);
          const centerX = (first + last) / 2;
          const centerY = axisY + AXIS_GAP + baseSize / 2;
          return (
            <g key={tier}>
              <image
                href={imageUrl}
                x={centerX - size / 2}
                y={centerY - size / 2}
                width={size}
                height={size}
                filter={`url(#${filterId})`}
              >
                <title>{rank?.name ?? `Rank ${tier}`}</title>
              </image>
              {showNames && rank?.name && (
                <text x={centerX} y={nameY} textAnchor="middle" dominantBaseline="hanging" {...CHART_TICK}>
                  {rank.name}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </ZIndexLayer>
  );
}
