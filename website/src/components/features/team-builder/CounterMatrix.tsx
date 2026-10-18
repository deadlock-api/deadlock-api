import { ArrowLeftRightIcon } from "lucide-react";
import { useState } from "react";

import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Button } from "~/components/ui/button";
import { type DraftAnalysis, type StatsIndex, transposeMatchups } from "~/lib/team-builder/analysis";
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

  const cells = swapped ? transposeMatchups(counterMatrix, index) : counterMatrix;
  // Scaled to the draft in front of you: a fixed bound washes out a set of tight matchups.
  const scale = autoScale(cells.flat().map((cell) => cell.edge));

  return (
    <Panel>
      <PanelHeader title="Counter matrix">
        <Button
          variant="toggle"
          size="xs"
          aria-pressed={swapped}
          aria-label="Swap axes"
          onClick={() => setSwapped((current) => !current)}
          className="ms-auto"
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
          <MatchupGrid cells={cells} index={index} scale={scale} margins variant="matrix" />
        </PanelBody>
      )}
    </Panel>
  );
}
