import { useQuery } from "@tanstack/react-query";
import { ShieldIcon, SwordsIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { Skeleton } from "~/components/ui/skeleton";
import type { DraftControls } from "~/hooks/useDraft";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import type { DraftAnalysis, LaneReassignment, Side, Swap } from "~/lib/team-builder/analysis";
import {
  confidencePips,
  deltaClass,
  formatCount,
  formatPoints,
  MAX_CONFIDENCE_PIPS,
  NO_DATA,
} from "~/lib/team-builder/format";
import { LANES, slotsOfLane } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";
import type { ImportedMatch } from "~/queries/match-import-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { DeltaValue } from "./DeltaBar";
import { DraftSlot, type SlotRef } from "./DraftSlot";
import { LaneSwapBanner } from "./LaneSwapBanner";
import { StatTooltip } from "./StatTooltip";

function pipColor(filledPips: number): string {
  if (filledPips >= 4) return "bg-green-400";
  if (filledPips >= 2) return "bg-yellow-400";
  return "bg-red-400";
}

/** The interval half-width is in win-rate points, so these thresholds read directly off it. */
const CONFIDENCE_LABEL = (margin: number) => (margin <= 1.5 ? "high" : margin <= 3 ? "medium" : "low");

interface DraftBoardProps {
  controls: DraftControls;
  analysis: DraftAnalysis;
  imported: ImportedMatch | null;
  loading: boolean;
  /** Best replacement per drafted slot, keyed by slot index within each side. */
  swaps: Record<Side, Map<number, Swap>>;
  laneSuggestions: Record<Side, LaneReassignment | undefined>;
  onPick: (side: Side, slot: number) => void;
}

function SideHeader({ side, badge }: { side: Side; badge?: number }) {
  const ally = side === "ally";
  const Icon = ally ? ShieldIcon : SwordsIcon;
  // `/v1/matches/{id}/metadata` reports the badge per team, not per player, so it belongs here.
  const { data: ranks = [] } = useQuery({ ...ranksQueryOptions, enabled: badge !== undefined });

  return (
    <div className={cn("mb-2 flex items-center gap-2", !ally && "flex-row-reverse")}>
      <Icon className={cn("size-3.5", ally ? "text-green-400" : "text-primary")} />
      <span className={cn("text-[13px] font-semibold", ally ? "text-green-400" : "text-primary")}>
        {ally ? "Amber Hand" : "Sapphire Flame"}
      </span>
      {badge !== undefined && ranks.length > 0 && (
        <BadgeImage badge={badge} ranks={ranks} className="size-5" title="Team average rank" />
      )}
    </div>
  );
}

export function DraftBoard({ controls, analysis, imported, loading, swaps, laneSuggestions, onPick }: DraftBoardProps) {
  const { draft, setSlot, moveSlot, reorderSide } = controls;
  const [dragging, setDragging] = useState<SlotRef | null>(null);
  const accountIds = useMemo(
    () => (imported?.players ?? []).map((p) => p.accountId).filter((id) => id > 0),
    [imported],
  );
  const { profiles } = useSteamProfiles(accountIds);

  const accountBySlot = useMemo(
    () => new Map((imported?.players ?? []).map((p) => [`${p.side}:${p.slot}`, p.accountId])),
    [imported],
  );
  const playerName = (side: Side, slot: number) => {
    const accountId = accountBySlot.get(`${side}:${slot}`);
    return accountId === undefined ? undefined : profiles[accountId]?.personaname;
  };

  const renderSide = (side: Side) => {
    const laneSuggestion = laneSuggestions[side];
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <SideHeader side={side} badge={imported?.badges[side]} />
        {/* One boxed group per lane: the two slots that share a box are the two heroes that share a
          lane, which is what the slot ordering encodes. */}
        <div className="grid grid-cols-3 gap-2">
          {LANES.map((lane, laneIndex) => (
            <div
              key={lane.id}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-1.5"
              style={{ borderTopColor: lane.color, borderTopWidth: 2 }}
            >
              <div className="mb-1 text-center text-[10px] font-semibold" style={{ color: lane.color }}>
                {lane.name}
              </div>
              <div className="flex items-start justify-center gap-1.5">
                {slotsOfLane(laneIndex).map((slot) => (
                  <DraftSlot
                    key={`${side}-${slot}`}
                    heroId={draft[side][slot] ?? null}
                    slot={slot}
                    side={side}
                    player={playerName(side, slot)}
                    suggestion={swaps[side].get(slot)}
                    onSwap={(heroId) => setSlot(side, slot, heroId)}
                    isDragging={dragging?.side === side && dragging.slot === slot}
                    onPick={() => onPick(side, slot)}
                    onClear={() => setSlot(side, slot, null)}
                    onDragStart={() => setDragging({ side, slot })}
                    onDragEnd={() => setDragging(null)}
                    onDropHero={(from) => {
                      moveSlot(from, { side, slot });
                      setDragging(null);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {laneSuggestion && (
          <LaneSwapBanner
            suggestion={laneSuggestion}
            side={side}
            onApply={() => reorderSide(side, laneSuggestion.slots)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col items-stretch gap-5 xl:flex-row xl:items-stretch xl:gap-6">
      {renderSide("ally")}

      <div className="flex flex-none flex-col items-center px-3 text-center">
        <div className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Predicted</div>
        {loading ? (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <>
            {/* Both sides, each in its own team colour, so the split reads without doing the
                subtraction. The favoured side is simply the larger number. */}
            <div className="text-4xl font-bold tracking-tight tabular-nums">
              {analysis.predicted === undefined ? (
                NO_DATA
              ) : (
                <>
                  <span className="text-green-400">{analysis.predicted.toFixed(1)}%</span>
                  <span className="mx-1.5 text-muted-foreground">:</span>
                  <span className="text-primary">{(100 - analysis.predicted).toFixed(1)}%</span>
                </>
              )}
            </div>
            {analysis.margin !== undefined && analysis.predicted !== undefined && (
              <StatTooltip
                title="How firm is this number?"
                rows={[
                  {
                    label: "Range",
                    value: `${(analysis.predicted - analysis.margin).toFixed(1)}% to ${(analysis.predicted + analysis.margin).toFixed(1)}%`,
                  },
                  { label: "Confidence", value: CONFIDENCE_LABEL(analysis.margin) },
                ]}
              >
                <div className="cursor-default text-xs text-muted-foreground tabular-nums">
                  ±{analysis.margin.toFixed(1)} · {CONFIDENCE_LABEL(analysis.margin)} confidence
                </div>
              </StatTooltip>
            )}

            {/* The breakdown sits with the number it explains, each term next to the sample it
                rests on, so weight and reliability read together. */}
            <div className="mt-3 w-64 space-y-2 border-t border-border pt-2.5">
              {analysis.contributions.map((contribution) => {
                const filledPips = confidencePips(contribution.matches);
                return (
                  <StatTooltip
                    key={contribution.key}
                    title={contribution.label}
                    rows={[
                      {
                        label: "Contribution",
                        value: formatPoints(contribution.value),
                        className: deltaClass(contribution.value),
                      },
                      { label: "Thinnest sample", value: formatCount(contribution.matches) },
                      { label: "Confidence", value: `${filledPips} of ${MAX_CONFIDENCE_PIPS}` },
                    ]}
                  >
                    <div className="flex cursor-default items-center gap-2 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                        {contribution.label}
                      </span>
                      <span className="flex shrink-0 gap-0.5">
                        {Array.from({ length: MAX_CONFIDENCE_PIPS }, (_, i) => (
                          <span
                            key={i}
                            className={cn(
                              "h-3 w-1.5 rounded-[1px]",
                              i < filledPips ? pipColor(filledPips) : "bg-border",
                            )}
                          />
                        ))}
                      </span>
                      <DeltaValue value={contribution.value} className="w-10 shrink-0 text-right font-semibold" />
                    </div>
                  </StatTooltip>
                );
              })}
            </div>
          </>
        )}
      </div>

      {renderSide("enemy")}
    </div>
  );
}
