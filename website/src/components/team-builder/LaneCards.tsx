import { Skeleton } from "~/components/ui/skeleton";
import type { LaneRow, Side, StatsIndex } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatRate } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { HeroPortrait } from "./HeroPortrait";
import { HeroTooltip } from "./StatTooltip";

function LaneSide({ heroes, side, index }: { heroes: number[]; side: Side; index: StatsIndex }) {
  return (
    <div className={cn("flex flex-1 gap-1.5", side === "enemy" && "justify-end")}>
      {/* Keyed by slot position, not by occupant: hero ids and slot indices overlap, so a lane
          holding hero 1 next to an empty slot would otherwise render two children keyed "1". */}
      {[0, 1].map((i) =>
        heroes[i] === undefined ? (
          <div key={`slot-${i}`} className="size-9.5 rounded-full border border-dashed border-white/[0.12]" />
        ) : (
          <HeroTooltip key={`slot-${i}`} heroId={heroes[i]} index={index}>
            <HeroPortrait heroId={heroes[i]} size="size-9.5" side={side} />
          </HeroTooltip>
        ),
      )}
    </div>
  );
}

/** A side's share of the track: 50% of the matchup fills nothing, 100% fills its whole half. */
const halfWidth = (share: number) => `${Math.min(100, Math.max(0, share * 200 - 100))}%`;

export function LaneCards({
  lanes,
  index,
  loading,
  onOpen,
}: {
  lanes: LaneRow[];
  index: StatsIndex;
  loading: boolean;
  onOpen: (lane: LaneRow) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {lanes.map((row) => {
        const pending = loading || !row.complete || row.winRate === undefined;
        const share = row.winRate ?? 0.5;
        return (
          <button
            key={row.lane.id}
            type="button"
            onClick={() => !pending && onOpen(row)}
            disabled={pending}
            style={{ borderTopColor: row.lane.color, borderTopWidth: 2 }}
            title={`${row.lane.name} lane`}
            className={cn(
              "rounded-xl border border-border bg-card p-3.5 text-left transition-colors",
              pending ? "opacity-55" : "cursor-pointer hover:border-white/20",
            )}
          >
            <div className="flex items-center gap-2">
              <LaneSide heroes={row.ally} side="ally" index={index} />
              {/* The lane's numbers sit where the "vs" would be: they belong to the matchup, not a side. */}
              <div className="min-w-16 text-center">
                {loading ? (
                  <Skeleton className="mx-auto h-8 w-14" />
                ) : (
                  <>
                    <div className="text-base leading-tight font-bold tabular-nums">{formatRate(row.winRate)}</div>
                    {row.soulLead && (
                      <div
                        className={cn("text-[10px] tabular-nums", deltaClass(row.soulLead.diff))}
                        title={`Mean soul lead 9 minutes in, over ${formatCount(row.soulLead.matches)} lane matchups`}
                      >
                        {row.soulLead.diff >= 0 ? "+" : ""}
                        {Math.round(row.soulLead.diff).toLocaleString()} souls after 9min
                      </div>
                    )}
                  </>
                )}
              </div>
              <LaneSide heroes={row.enemy} side="enemy" index={index} />
            </div>

            {/* Two-sided fill: each half of the track is one side's share of the matchup, growing
                outwards from the centre. */}
            <div className="relative my-3 flex h-1.5 gap-px rounded-full bg-muted">
              <div className="flex flex-1 justify-end">
                <div className="h-full rounded-l-full bg-primary/70" style={{ width: halfWidth(1 - share) }} />
              </div>
              <div className="flex flex-1">
                <div className="h-full rounded-r-full bg-green-400/70" style={{ width: halfWidth(share) }} />
              </div>
              {/* Marks the even point the two fills grow away from. */}
              <div className="absolute inset-y-[-2px] left-1/2 w-px -translate-x-1/2 bg-white/60" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
