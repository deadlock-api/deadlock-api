import { Skeleton } from "~/components/ui/skeleton";
import { type LaneRow, mean, type Side, type SoulCurves, type StatsIndex } from "~/lib/team-builder/analysis";
import { autoScale, formatCount, formatRate, NO_DATA } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { HeroPortrait } from "./HeroPortrait";
import { LaneSoulCurve } from "./LaneSoulCurve";
import { MatchupGrid } from "./MatchupGrid";
import { HeroTooltip } from "./StatTooltip";

function LaneSide({ heroes, side, index }: { heroes: number[]; side: Side; index: StatsIndex }) {
  return (
    <div className={cn("flex min-w-0 flex-1 gap-1.5", side === "enemy" && "justify-end")}>
      {/* Keyed by slot position, not by occupant: hero ids and slot indices overlap, so a lane
          holding hero 1 next to an empty slot would otherwise render two children keyed "1". */}
      {[0, 1].map((i) =>
        heroes[i] === undefined ? (
          <div
            key={`slot-${i}`}
            className="size-8 rounded-full border border-dashed border-white/[0.12] 2xl:size-9.5"
          />
        ) : (
          <HeroTooltip key={`slot-${i}`} heroId={heroes[i]} index={index}>
            <HeroPortrait heroId={heroes[i]} size="size-8 2xl:size-9.5" side={side} />
          </HeroTooltip>
        ),
      )}
    </div>
  );
}

/** Points of win rate that fill a half-track. Real lane matchups land within a few points of even. */
const LANE_BAR_SCALE = 10;

/** A side's share of the track, in win-rate points away from even. */
const halfWidth = (share: number) => `${Math.min(100, Math.max(0, ((share - 0.5) * 100 * 100) / LANE_BAR_SCALE))}%`;

function LaneMatchupMatrix({ row, index }: { row: LaneRow; index: StatsIndex }) {
  // These edges are measured against an even lane rather than against each hero's own baseline, so
  // the column hero's view really is the negation of the ally's.
  const columnAverages = row.duel[0].map((_, column) => {
    const allyView = mean(row.duel.map((cells) => cells[column].edge));
    return allyView === undefined ? undefined : -allyView;
  });

  return (
    <MatchupGrid
      cells={row.duel}
      index={index}
      scale={autoScale(
        row.duel.flat().map((cell) => cell.edge),
        3,
      )}
      columnMargins={columnAverages}
      variant="duel"
    />
  );
}

export function LaneCards({
  lanes,
  index,
  loading,
  soulCurves,
  curveLoading,
}: {
  lanes: LaneRow[];
  index: StatsIndex;
  loading: boolean;
  soulCurves: SoulCurves;
  /** Tracked apart from `loading`: the curve is a separate request and lands after the rest. */
  curveLoading: boolean;
}) {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-3">
      {lanes.map((row) => {
        const pending = loading || !row.complete || row.winRate === undefined;
        const share = row.winRate ?? 0.5;
        const curve = row.complete ? soulCurves.get(row.lane.id, row.ally, row.enemy) : undefined;
        return (
          <div
            key={row.lane.id}
            style={{ borderTopColor: row.lane.color, borderTopWidth: 2 }}
            className={cn("rounded-xl border border-border bg-card p-3.5 text-left", pending && "opacity-55")}
          >
            {/* Named in text, not only by the coloured top border, which is not an identity cue a
                reader who does not separate these hues can use. */}
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold" style={{ color: row.lane.color }}>
                {row.lane.name} lane
              </span>
              {!loading && row.matches > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{formatCount(row.matches)} games</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <LaneSide heroes={row.ally} side="ally" index={index} />
              {/* The lane's numbers sit where the "vs" would be: they belong to the matchup, not a side. */}
              <div className="min-w-28 text-center 2xl:min-w-44">
                {loading ? (
                  <Skeleton className="mx-auto h-8 w-28" />
                ) : (
                  <>
                    <div className="text-lg leading-tight font-bold whitespace-nowrap tabular-nums">
                      {row.winRate === undefined ? (
                        NO_DATA
                      ) : (
                        <>
                          <span className="text-green-400">{formatRate(row.winRate)}</span>
                          <span className="mx-0.5 text-muted-foreground">:</span>
                          <span className="text-primary">{formatRate(1 - row.winRate)}</span>
                        </>
                      )}
                    </div>
                    <div
                      className="relative mt-1.5 flex h-1.5 gap-px rounded-full bg-muted"
                      title={`Each half is one duo's share, full at ±${LANE_BAR_SCALE} points`}
                    >
                      <div className="flex flex-1 justify-end">
                        <div className="h-full rounded-l-full bg-green-400/70" style={{ width: halfWidth(share) }} />
                      </div>
                      <div className="flex flex-1">
                        <div className="h-full rounded-r-full bg-primary/70" style={{ width: halfWidth(1 - share) }} />
                      </div>
                      <div className="absolute inset-y-[-2px] left-1/2 w-px -translate-x-1/2 bg-white/60" />
                    </div>
                  </>
                )}
              </div>
              <LaneSide heroes={row.enemy} side="enemy" index={index} />
            </div>

            {!pending && (
              <div className="mt-3.5 flex items-stretch gap-3 border-t border-border pt-3">
                <div className="w-40 shrink-0">
                  <div className="mb-1 text-[11px] font-semibold">Matchups</div>
                  <LaneMatchupMatrix row={row} index={index} />
                </div>
                {/* Always laid out, even with nothing to draw yet: the curve resolves after the rest
                    of the card, and leaving the column out until then shifted the matrix sideways. */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="mb-1 text-[11px] font-semibold">Soul lead</div>
                  <div className="min-h-0 flex-1">
                    {curve && curve.length > 1 ? (
                      <LaneSoulCurve points={curve} />
                    ) : curveLoading ? (
                      <Skeleton className="h-full min-h-16 w-full" />
                    ) : (
                      <div className="flex h-full min-h-16 items-center justify-center rounded-md border border-dashed border-white/[0.12] px-2 text-center text-[10px] text-muted-foreground">
                        No souls recorded for this pairing
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
