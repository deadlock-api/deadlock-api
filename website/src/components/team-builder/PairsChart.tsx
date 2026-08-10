import type { PairRow, StatsIndex } from "~/lib/team-builder/analysis";
import { autoScale } from "~/lib/team-builder/format";

import { DeltaBar, DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { PairTooltip } from "./PairTooltip";

function PairBar({
  pair,
  index,
  scale,
  onOpen,
}: {
  pair: PairRow;
  index: StatsIndex;
  scale: number;
  onOpen: (pair: PairRow) => void;
}) {
  return (
    <PairTooltip pair={pair} index={index}>
      <button
        type="button"
        onClick={() => onOpen(pair)}
        className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-1 hover:bg-white/[0.03]"
      >
        <span className="flex shrink-0 gap-0.5">
          <HeroPortrait heroId={pair.a} size="size-6" />
          <HeroPortrait heroId={pair.b} size="size-6" />
        </span>
        <DeltaBar value={pair.delta} scale={scale} className="min-w-0 flex-1" />
        <DeltaValue value={pair.delta} className="w-12 shrink-0 text-right text-xs font-bold" />
      </button>
    </PairTooltip>
  );
}

/** Every pairing on one axis, sorted by synergy, so the outliers of the draft read at a glance. */
export function PairsChart({
  pairs,
  index,
  onOpen,
}: {
  pairs: PairRow[];
  index: StatsIndex;
  onOpen: (pair: PairRow) => void;
}) {
  const scale = autoScale(
    pairs.map((pair) => pair.delta),
    2,
  );

  return (
    <div className="p-4">
      <p className="mb-2 text-xs text-muted-foreground">
        Win-rate points each pairing wins above what its two heroes win apart.
      </p>
      <div className="space-y-0.5">
        {pairs.map((pair) => (
          <PairBar key={`${pair.a}-${pair.b}`} pair={pair} index={index} scale={scale} onOpen={onOpen} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>−{scale} pts</span>
        <span>even</span>
        <span>+{scale} pts</span>
      </div>
    </div>
  );
}
