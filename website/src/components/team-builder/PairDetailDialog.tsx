import { HeroName } from "~/components/HeroName";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { type DraftAnalysis, type PairRow, pairVsEnemyRows, type StatsIndex } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatPoints, formatRate, NO_DATA } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { DeltaBar, DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { StatTiles } from "./StatTiles";

export function PairDetailBody({
  pair,
  analysis,
  index,
  filterSummary,
}: {
  pair: PairRow;
  analysis: DraftAnalysis;
  index: StatsIndex;
  filterSummary: string;
}) {
  const apart = index.expectedApart(pair.a, pair.b);

  // The lane row only exists when this exact duo is assigned to a lane together on the board.
  const laneRow = analysis.lanes.find((row) => row.complete && row.ally.includes(pair.a) && row.ally.includes(pair.b));

  const enemyRows = pairVsEnemyRows(pair, analysis.enemyHeroes, index);

  return (
    <DialogContent className="max-h-[85dvh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
      <DialogHeader className="flex-row items-center gap-3.5 space-y-0 p-5">
        <div className="flex flex-none gap-1">
          <HeroPortrait heroId={pair.a} side="ally" size="size-12" />
          <HeroPortrait heroId={pair.b} side="ally" size="size-12" />
        </div>
        <div className="flex-1 text-left">
          <DialogTitle className="flex gap-1.5 text-lg">
            <HeroName heroId={pair.a} /> & <HeroName heroId={pair.b} />
          </DialogTitle>
          {/* Radix requires a description; the header already says which pair this is, and the
              filter scope is read off the filter bar behind the dialog. */}
          <DialogDescription className="sr-only">Same team · {filterSummary}</DialogDescription>
        </div>
        <div className="pr-6 text-right">
          <div className="text-2xl font-bold tabular-nums">{formatRate(pair.winRate)}</div>
          <div className={cn("text-[13px] font-semibold tabular-nums", deltaClass(pair.delta))}>
            {formatPoints(pair.delta)} vs. expected
          </div>
        </div>
      </DialogHeader>

      <StatTiles
        tiles={[
          { label: "Matches together", value: formatCount(pair.matches) },
          {
            label: "Win rate together",
            value: formatRate(pair.winRate),
            note: `${formatPoints(pair.delta)} above expected`,
            noteClassName: deltaClass(pair.delta),
          },
          {
            label: "As a lane duo",
            value: laneRow ? formatRate(laneRow.winRate) : NO_DATA,
            note: laneRow ? `${formatCount(laneRow.matches)} lane matchups` : "not laning together",
            noteClassName: "text-muted-foreground",
          },
          {
            label: "Apart",
            value: formatRate(apart),
            note: "average solo baseline",
            noteClassName: "text-muted-foreground",
          },
        ]}
      />

      <div className="p-5">
        <div className="mb-1 text-sm font-semibold">How the two fare against each enemy pick</div>
        <p className="mb-3 text-xs text-muted-foreground">
          Mean of the two heroes' matchup edge against that enemy, in win-rate points.
        </p>
        {enemyRows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Draft the enemy side to see matchups.</p>
        ) : (
          enemyRows.map((row) => (
            <div
              key={row.enemy}
              className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
            >
              <HeroPortrait heroId={row.enemy} size="size-7.5" />
              <span className="flex min-w-0 flex-1 gap-1 truncate text-[13px]">
                vs. <HeroName heroId={row.enemy} />
              </span>
              <DeltaBar value={row.edge} scale={4} className="hidden w-40 sm:block" />
              <DeltaValue value={row.edge} className="w-14 text-right text-[13px] font-bold" />
              <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                {formatCount(row.matches)}
              </span>
            </div>
          ))
        )}
      </div>
    </DialogContent>
  );
}
