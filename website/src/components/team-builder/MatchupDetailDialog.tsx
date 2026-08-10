import { HeroName } from "~/components/HeroName";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import type { MatchupCell, StatsIndex } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatPoints, formatRate } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { DeltaBar } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { StatTiles } from "./StatTiles";

/** The drill-down for one cell of the counter matrix: the hero-versus-hero matchup it describes. */
export function MatchupDetailBody({
  cell,
  index,
  filterSummary,
}: {
  cell: MatchupCell;
  index: StatsIndex;
  filterSummary: string;
}) {
  const baseline = index.heroWinRate(cell.hero);

  return (
    <DialogContent className="gap-0 p-0 sm:max-w-lg">
      <DialogHeader className="space-y-0 border-b border-border p-5 text-left">
        <DialogTitle className="flex items-center gap-2 text-base">
          <HeroName heroId={cell.hero} /> <span className="text-muted-foreground">vs.</span>{" "}
          <HeroName heroId={cell.enemy} />
        </DialogTitle>
        <DialogDescription className="sr-only">{filterSummary}</DialogDescription>

        <div className="mt-4 flex items-center justify-center gap-5">
          <HeroPortrait heroId={cell.hero} side="ally" size="size-14" />
          <div className="text-center">
            <div className={cn("text-3xl leading-none font-bold tabular-nums", deltaClass(cell.edge))}>
              {formatPoints(cell.edge)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">win-rate points</div>
          </div>
          <HeroPortrait heroId={cell.enemy} side="enemy" size="size-14" />
        </div>

        <DeltaBar value={cell.edge} scale={10} className="mx-auto mt-4 w-full max-w-xs" />
        <div className="mx-auto mt-1.5 flex w-full max-w-xs justify-between text-[10px] text-muted-foreground">
          <span>enemy favoured</span>
          <span>±10 pts</span>
          <span>your hero favoured</span>
        </div>
      </DialogHeader>

      <StatTiles
        tiles={[
          { label: "In this matchup", value: formatRate(cell.winRate) },
          { label: "Own baseline", value: formatRate(baseline) },
          {
            label: "Edge",
            value: formatPoints(cell.edge),
            note: "vs. own baseline",
            noteClassName: "text-muted-foreground",
          },
          { label: "Games", value: formatCount(cell.matches) },
        ]}
      />

      <p className="px-5 py-4 text-xs text-muted-foreground">
        Edge is how this hero does against {<HeroName heroId={cell.enemy} />} compared with how the hero does overall,
        so it isolates the matchup from the hero's own strength. A positive edge on a hero with a losing baseline can
        still be a losing matchup.
      </p>
    </DialogContent>
  );
}
