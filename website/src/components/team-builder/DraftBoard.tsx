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
  roundToSum,
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
const CONFIDENCE_LABEL = (margin: number) =>
  margin <= 3 ? "firm" : margin <= 6 ? "usable" : margin <= 10 ? "rough" : "a guess";

/** Above this half-width the second decimal claims precision the model does not have. */
const COARSE_MARGIN = 2;

/** The window the uncertainty bar spans. Predictions outside it are pinned to the end. */
const BAR_LO = 30;
const BAR_HI = 70;

/** The interval as a band: its width is the uncertainty, so a firm draft and a coin-flip differ at a glance. */
function IntervalBar({ predicted, margin }: { predicted: number; margin: number }) {
  const at = (value: number) => `${((Math.min(BAR_HI, Math.max(BAR_LO, value)) - BAR_LO) / (BAR_HI - BAR_LO)) * 100}%`;

  return (
    <div className="mt-2.5 w-52">
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 rounded-full bg-foreground/25"
          style={{ left: at(predicted - margin), right: `calc(100% - ${at(predicted + margin)})` }}
        />
        <div className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-white/50" />
        <div
          className={cn(
            "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background",
            predicted >= 50 ? "bg-green-400" : "bg-primary",
          )}
          style={{ left: at(predicted) }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{BAR_LO}%</span>
        <span>even</span>
        <span>{BAR_HI}%</span>
      </div>
    </div>
  );
}

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

  const { predicted, margin, contributions } = analysis;
  const decimals = margin !== undefined && margin > COARSE_MARGIN ? 0 : 1;
  // An undefined term prints `n/a` and contributes nothing to the sum the total has to match.
  const displayValues = useMemo(() => {
    if (predicted === undefined) return contributions.map((c) => c.value);
    const known = contributions.map((c) => c.value ?? 0);
    const adjusted = roundToSum(known, predicted - 50);
    return contributions.map((c, i) => (c.value === undefined ? undefined : adjusted[i]));
  }, [contributions, predicted]);

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
    // Side-by-side only from 2xl: the centre column is a fixed ~280px, so a row any earlier leaves
    // each six-slot side under 40px per portrait.
    <div className="flex flex-col items-stretch gap-5 2xl:flex-row 2xl:items-stretch 2xl:gap-6">
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
                  <span className="text-green-400">{analysis.predicted.toFixed(decimals)}%</span>
                  <span className="mx-1.5 text-muted-foreground">:</span>
                  <span className="text-primary">{(100 - analysis.predicted).toFixed(decimals)}%</span>
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
                  { label: "Widest term", value: `±${analysis.margin.toFixed(1)} pts` },
                ]}
              >
                <button type="button" className="cursor-default rounded">
                  <IntervalBar predicted={analysis.predicted} margin={analysis.margin} />
                </button>
              </StatTooltip>
            )}

            <div className="mt-2 w-64 space-y-2 border-t border-border pt-2.5">
              {analysis.contributions.map((contribution, i) => {
                const filledPips = confidencePips(contribution.matches);
                const shown = displayValues[i];
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
                    {/* A button so Radix opens the card on focus, not just on hover. */}
                    <button type="button" className="flex w-full cursor-default items-center gap-2 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                        {contribution.label}
                      </span>
                      <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                        {Array.from({ length: MAX_CONFIDENCE_PIPS }, (_, pip) => (
                          <span
                            key={pip}
                            className={cn(
                              "h-3 w-1.5 rounded-[1px]",
                              pip < filledPips ? pipColor(filledPips) : "bg-border",
                            )}
                          />
                        ))}
                      </span>
                      <DeltaValue value={shown} className="w-10 shrink-0 text-right font-semibold" />
                    </button>
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
