import type { Rank } from "deadlock_api_client";
import { useId } from "react";
import { DefaultZIndexes, usePlotArea, useXAxisScale, ZIndexLayer } from "recharts";

const ICON_SIZE = 48;
/** Distance from the bottom of the plot to the icon centers. */
const BOTTOM_MARGIN = 32;

export interface TierSpan {
  tier: number;
  firstBadge: number;
  lastBadge: number;
}

/**
 * Each rank tier's badge, drawn in front of its subtier bars at the bottom of the plot. Render it through `<Customized>`
 * in a chart whose x axis is keyed by badge (`tier * 10 + subtier`); it reads the axis scale from the chart context,
 * since recharts 3 no longer hands axis maps to customized components as props.
 */
export function RankTierIcons({ tiers, ranks }: { tiers: TierSpan[]; ranks: ReadonlyMap<number, Rank> }) {
  const scale = useXAxisScale();
  const plot = usePlotArea();
  // React's ids contain characters that break a `url(#...)` reference.
  const filterId = `rank-icon-shadow-${useId().replace(/[^\w-]/g, "")}`;
  if (!scale || !plot) return null;

  const iconY = plot.y + plot.height - BOTTOM_MARGIN;
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.bar + 1}>
      <g style={{ pointerEvents: "none" }}>
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.7" />
          </filter>
        </defs>
        {tiers.map(({ tier, firstBadge, lastBadge }) => {
          const first = scale(firstBadge, { position: "middle" });
          const last = scale(lastBadge, { position: "middle" });
          const rank = ranks.get(tier);
          const imageUrl = rank?.images?.large_webp ?? rank?.images?.large;
          if (first == null || last == null || !imageUrl) return null;

          // Shrink to the tier's width on narrow charts; the higher tiers' source images carry more transparent padding.
          const size =
            Math.min(ICON_SIZE, (last - first) * 1.2) * (tier === 8 || tier === 9 ? 1.6 : tier >= 10 ? 1.4 : 1);
          return (
            <image
              key={tier}
              href={imageUrl}
              x={(first + last) / 2 - size / 2}
              y={iconY - size / 2}
              width={size}
              height={size}
              filter={`url(#${filterId})`}
            />
          );
        })}
      </g>
    </ZIndexLayer>
  );
}
