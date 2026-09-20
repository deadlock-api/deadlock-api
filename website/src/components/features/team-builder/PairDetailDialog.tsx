import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { Card } from "~/components/ui/card";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Stack } from "~/components/ui/stack";
import { type DraftAnalysis, type PairRow, pairVsEnemyRows, type StatsIndex } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatPoints, formatRate, NO_DATA } from "~/lib/team-builder/format";
import { SIDE_RING } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";

import { Points } from "./Points";
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
    <DialogContent size="xl" className="max-h-5/6 max-w-3xl gap-0 p-0">
      <DialogHeader className="flex-row items-center gap-3.5 p-5">
        <div className="flex flex-none gap-1">
          <HeroImage heroId={pair.a} shape="circle" ring={SIDE_RING.ally} className="size-12 shrink-0" />
          <HeroImage heroId={pair.b} shape="circle" ring={SIDE_RING.ally} className="size-12 shrink-0" />
        </div>
        <div className="flex-1 text-start">
          <DialogTitle className="flex gap-1.5 text-lg">
            <HeroName heroId={pair.a} /> & <HeroName heroId={pair.b} />
          </DialogTitle>
          {/* Radix requires a description; the header already says which pair this is, and the
              filter scope is read off the filter bar behind the dialog. */}
          <DialogDescription className="sr-only">Same team · {filterSummary}</DialogDescription>
        </div>
        <div className="pe-6 text-end">
          <div className="text-2xl font-bold tabular-nums">{formatRate(pair.winRate)}</div>
          <div className={cn("text-sm font-semibold tabular-nums", deltaClass(pair.delta))}>
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

      <Stack gap={3} className="p-5">
        <Stack gap={1}>
          <div className="text-sm font-semibold">How the two fare against each enemy pick</div>
          <p className="text-xs text-muted-foreground">
            Mean of the two heroes' matchup edge against that enemy, in win-rate points.
          </p>
        </Stack>
        {enemyRows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Draft the enemy side to see matchups.</p>
        ) : (
          <Stack gap={2}>
            {enemyRows.map((row) => (
              <Card key={row.enemy} tone="inset" size="xs" className="flex-row items-center gap-3 p-2.5">
                <HeroImage heroId={row.enemy} shape="circle" className="size-7.5 shrink-0" />
                <span className="flex min-w-0 flex-1 gap-1 truncate text-sm">
                  vs. <HeroName heroId={row.enemy} />
                </span>
                <DivergingBar value={row.edge} scale={4} className="hidden w-40 sm:block" />
                <Points value={row.edge} align="end" className="w-14 text-sm font-bold" />
                <span className="w-16 text-end text-xs text-muted-foreground tabular-nums">
                  {formatCount(row.matches)}
                </span>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </DialogContent>
  );
}
