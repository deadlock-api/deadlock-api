import { HeroName } from "~/components/HeroName";
import type { Recommendation } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatPoints, formatRate } from "~/lib/team-builder/format";

import { StatTooltip } from "./StatTooltip";

/** The one hover card for a candidate pick, so the ranked list and the plot never state it differently. */
export function RecommendationTooltip({ rec, children }: { rec: Recommendation; children: React.ReactNode }) {
  return (
    <StatTooltip
      // A name element rather than a string: the card renders on hover, so a full list of rows does
      // not each hold a hero-asset subscription just to label a tooltip nobody opened.
      title={<HeroName heroId={rec.heroId} />}
      rows={[
        { label: "Synergy with your picks", value: formatPoints(rec.synergy), className: deltaClass(rec.synergy) },
        { label: "Matchup vs. the enemy", value: formatPoints(rec.counter), className: deltaClass(rec.counter) },
        { label: "Solo strength", value: formatPoints(rec.solo), className: deltaClass(rec.solo) },
        { label: "Baseline win rate", value: formatRate(rec.winRate) },
        { label: "Matches", value: formatCount(rec.matches) },
      ]}
    >
      {children}
    </StatTooltip>
  );
}
