import { HeroImage } from "~/components/domain/assets/HeroImage";
import { PanelBody } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Stack } from "~/components/ui/stack";
import type { PairRow, StatsIndex } from "~/lib/team-builder/analysis";
import { autoScale } from "~/lib/team-builder/format";

import { PairTooltip } from "./PairTooltip";
import { Points } from "./Points";

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
      <Button variant="row" onClick={() => onOpen(pair)} className="h-9 px-1">
        <span className="flex shrink-0 gap-0.5">
          <HeroImage heroId={pair.a} shape="circle" className="size-6 shrink-0" />
          <HeroImage heroId={pair.b} shape="circle" className="size-6 shrink-0" />
        </span>
        <DivergingBar value={pair.delta} scale={scale} className="flex-1" />
        <Points value={pair.delta} align="end" className="w-12 shrink-0 text-xs font-bold" />
      </Button>
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
    <PanelBody className="flex flex-col gap-2">
      <Stack gap={0.5}>
        {pairs.map((pair) => (
          <PairBar key={`${pair.a}-${pair.b}`} pair={pair} index={index} scale={scale} onOpen={onOpen} />
        ))}
      </Stack>
      <div className="flex justify-between text-2xs text-muted-foreground">
        <span>−{scale} pts</span>
        <span>even</span>
        <span>+{scale} pts</span>
      </div>
    </PanelBody>
  );
}
