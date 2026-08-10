import { ArrowLeftRightIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { type DraftAnalysis, mean, type StatsIndex, transposeMatchups } from "~/lib/team-builder/analysis";
import { autoScale } from "~/lib/team-builder/format";

import { MatchupGrid } from "./MatchupGrid";
import { Panel, PanelBody, PanelHeader, PanelMessage, PanelSkeleton } from "./Panel";

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
          size="sm"
          onClick={() => setSwapped((current) => !current)}
          className="ml-auto h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          title="Swap the two axes"
        >
          <ArrowLeftRightIcon className="size-3.5" />
          <span className="hidden @[22rem]:inline">Swap</span>
        </Button>
      </PanelHeader>
      {loading ? (
        <PanelSkeleton rows={6} />
      ) : empty ? (
        <PanelMessage>Needs at least one hero on each side.</PanelMessage>
      ) : (
        // `@container` so the grid can derive its column width, and with it its square cap.
        <PanelBody className="@container flex flex-1 flex-col">
          <MatchupGrid cells={cells} index={index} scale={scale} columnMargins={columnAverages} variant="matrix" />
        </PanelBody>
      )}
    </Panel>
  );
}
