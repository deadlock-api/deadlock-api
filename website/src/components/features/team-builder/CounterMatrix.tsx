import { ArrowLeftRightIcon } from "lucide-react";
import { useState } from "react";

import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Button } from "~/components/ui/button";
import { type DraftAnalysis, mean, type StatsIndex, transposeMatchups } from "~/lib/team-builder/analysis";
import { autoScale } from "~/lib/team-builder/format";

import { MatchupGrid } from "./MatchupGrid";

interface CounterMatrixProps {
  analysis: DraftAnalysis;
  index: StatsIndex;
  loading: boolean;
}

export function CounterMatrix({ analysis, index, loading }: CounterMatrixProps) {
  const [swapped, setSwapped] = useState(false);
  const { allyHeroes, enemyHeroes, counterMatrix } = analysis;
  const empty = allyHeroes.length === 0 || enemyHeroes.length === 0;

  // The orientation not on screen is what the column margins are read from.
  const transposed = transposeMatchups(counterMatrix, index);
  const [cells, opposite] = swapped ? [transposed, counterMatrix] : [counterMatrix, transposed];
  // Scaled to the draft in front of you: a fixed bound washes out a set of tight matchups.
  const scale = autoScale(cells.flat().map((cell) => cell.edge));
  const columnAverages = opposite.map((row) => mean(row.map((cell) => cell.edge)));

  return (
    <Panel>
      <PanelHeader title="Counter matrix">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setSwapped((current) => !current)}
          className="ms-auto font-normal text-muted-foreground hover:text-foreground"
          title="Swap the two axes"
        >
          <ArrowLeftRightIcon />
          <span className="hidden @[22rem]:inline">Swap</span>
        </Button>
      </PanelHeader>
      {loading ? (
        <PanelBody>
          <SkeletonRows rows={6} />
        </PanelBody>
      ) : empty ? (
        <EmptyState variant="inline" className="px-4 py-6" title="Needs at least one hero on each side." />
      ) : (
        // `@container` so the grid can derive its column width, and with it its square cap.
        <PanelBody className="@container flex flex-1 flex-col">
          <MatchupGrid cells={cells} index={index} scale={scale} columnMargins={columnAverages} variant="matrix" />
        </PanelBody>
      )}
    </Panel>
  );
}
