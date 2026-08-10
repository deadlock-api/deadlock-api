import type { DraftAnalysis, MatchupCell, StatsIndex } from "~/lib/team-builder/analysis";
import { autoScale } from "~/lib/team-builder/format";

import { MatchupGrid, MatchupLegend } from "./MatchupGrid";
import { Panel, PanelBody, PanelHeader, PanelMessage, PanelSkeleton } from "./Panel";

interface CounterMatrixProps {
  analysis: DraftAnalysis;
  index: StatsIndex;
  loading: boolean;
  onOpen: (cell: MatchupCell) => void;
}

export function CounterMatrix({ analysis, index, loading, onOpen }: CounterMatrixProps) {
  const { allyHeroes, enemyHeroes, counterMatrix, counterAverages } = analysis;
  const empty = allyHeroes.length === 0 || enemyHeroes.length === 0;
  // Scaled to the draft in front of you: a fixed bound washes out a set of tight matchups.
  const scale = autoScale(counterMatrix.flat().map((cell) => cell.edge));

  return (
    <Panel>
      <PanelHeader title="Counter matrix" note="you vs. them" />
      {loading ? (
        <PanelSkeleton rows={6} />
      ) : empty ? (
        <PanelMessage>Needs at least one hero on each side.</PanelMessage>
      ) : (
        <PanelBody className="flex flex-1 flex-col">
          <MatchupGrid
            cells={counterMatrix}
            index={index}
            scale={scale}
            averages={counterAverages}
            variant="matrix"
            onSelect={onOpen}
          />
          <MatchupLegend scale={scale} />
        </PanelBody>
      )}
    </Panel>
  );
}
