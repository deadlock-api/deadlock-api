import { HeroName } from "~/components/HeroName";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { laneHeroRows, type LaneRow, type Side, type StatsIndex } from "~/lib/team-builder/analysis";
import { autoScale, formatCount, formatRate } from "~/lib/team-builder/format";

import { DeltaBar, DeltaValue } from "./DeltaBar";
import { HeroPortrait } from "./HeroPortrait";
import { MatchupGrid, MatchupLegend } from "./MatchupGrid";
import { StatTooltip } from "./StatTooltip";

function Duo({ heroIds, side }: { heroIds: number[]; side: Side }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {heroIds.map((heroId) => (
        <HeroPortrait key={heroId} heroId={heroId} side={side} size="size-11" />
      ))}
    </div>
  );
}

export function LaneDetailBody({
  lane,
  index,
  filterSummary,
}: {
  lane: LaneRow;
  index: StatsIndex;
  filterSummary: string;
}) {
  const perHero = laneHeroRows(lane);

  const duelScale = autoScale(
    lane.duel.flat().map((cell) => cell.edge),
    3,
  );

  return (
    <DialogContent className="max-h-[88dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
      <DialogHeader
        className="space-y-0 border-b border-border p-5 text-left"
        style={{ background: `linear-gradient(180deg, ${lane.lane.color}14, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: lane.lane.color }} />
          <DialogTitle className="text-base">{lane.lane.name} lane</DialogTitle>
        </div>
        <DialogDescription className="sr-only">{filterSummary}</DialogDescription>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:justify-between">
          <Duo heroIds={lane.ally} side="ally" />
          <div className="text-center">
            <div className="text-3xl leading-none font-bold tabular-nums">{formatRate(lane.winRate)}</div>
          </div>
          <Duo heroIds={lane.enemy} side="enemy" />
        </div>

        <DeltaBar value={lane.edge} scale={8} className="mx-auto mt-4 w-full max-w-sm" />
        <div className="mx-auto mt-1.5 flex w-full max-w-sm justify-between text-[10px] text-muted-foreground">
          <span>enemy duo favoured</span>
          <span>your duo favoured</span>
        </div>
      </DialogHeader>

      <div className="p-5 pb-0">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Each hero in this lane</h3>
          <StatTooltip
            title="What this number counts"
            rows={[
              { label: "Counts", value: "matches won" },
              { label: "Restricted to", value: `${lane.lane.name} lane` },
              { label: "Ignores", value: "souls, objectives, timers" },
            ]}
          >
            <span className="cursor-default text-xs text-muted-foreground underline decoration-dotted">
              how is this measured?
            </span>
          </StatTooltip>
        </div>
        <div className="space-y-1.5">
          {perHero.map((entry) => (
            <div key={`${entry.side}-${entry.heroId}`} className="flex items-center gap-2.5">
              <HeroPortrait heroId={entry.heroId} size="size-7" side={entry.side} />
              <span className="w-24 truncate text-xs">
                <HeroName heroId={entry.heroId} />
              </span>
              <DeltaBar value={entry.edge} scale={8} className="flex-1" />
              <span className="w-14 text-right text-xs tabular-nums">{formatRate(entry.winRate)}</span>
              <DeltaValue value={entry.edge} className="w-12 text-right text-xs font-semibold" />
              <span className="w-20 text-right text-[11px] text-muted-foreground tabular-nums">
                {formatCount(entry.matches)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-sm font-semibold">Hero against hero in this lane</h3>
        <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
          Win-rate points above even for each of the four individual matchups, counting only games where the two shared
          a lane.
        </p>
        <MatchupGrid cells={lane.duel} index={index} scale={duelScale} variant="duel" />
        <MatchupLegend scale={duelScale} />
      </div>
    </DialogContent>
  );
}
