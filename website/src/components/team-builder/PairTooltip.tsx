import { HeroName } from "~/components/HeroName";
import type { PairRow, StatsIndex } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatPoints, formatRate } from "~/lib/team-builder/format";

import { StatTooltip } from "./StatTooltip";

/** The one hover card for a pairing, so the ranked list and the chart never state it differently. */
export function PairTooltip({
  pair,
  index,
  children,
}: {
  pair: PairRow;
  index: StatsIndex;
  children: React.ReactNode;
}) {
  return (
    <StatTooltip
      title={
        <span className="flex gap-1">
          <HeroName heroId={pair.a} /> & <HeroName heroId={pair.b} />
        </span>
      }
      rows={[
        { label: "Win rate together", value: formatRate(pair.winRate) },
        { label: "Expected apart", value: formatRate(index.expectedApart(pair.a, pair.b)) },
        { label: "Synergy", value: formatPoints(pair.delta), className: deltaClass(pair.delta) },
        { label: "Matches", value: formatCount(pair.matches) },
      ]}
    >
      {children}
    </StatTooltip>
  );
}
