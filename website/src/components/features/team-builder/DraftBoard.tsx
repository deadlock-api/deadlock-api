import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { Card } from "~/components/ui/card";
import { Pips } from "~/components/ui/pips";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { TooltipTarget } from "~/components/ui/tooltip";
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
import { type LaneInfo, lanesOf, slotsOfLane, TEAM_NAMES, TEAM_SIZE } from "~/lib/team-builder/lanes";
import type { Tone } from "~/lib/tone";
import { cn } from "~/lib/utils";
import type { ImportedMatch } from "~/queries/match-import-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { DraftSlot, type SlotRef } from "./DraftSlot";
import { LaneSwapBanner } from "./LaneSwapBanner";
import { Points } from "./Points";
import { StatTooltip } from "./StatTooltip";
import { TeamEmblem } from "./TeamEmblem";

/** No tone is the warning colour, which is what a middling sample is. */
function pipTone(filledPips: number): Tone | undefined {
  if (filledPips >= 4) return "positive";
  if (filledPips >= 2) return undefined;
  return "negative";
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
  const even = (BAR_LO + BAR_HI) / 2;
  return (
    <Stack gap={1} className="w-52">
      <DivergingBar
        value={predicted - even}
        scale={BAR_HI - even}
        interval={[predicted - margin - even, predicted + margin - even]}
        className="h-2"
      />
      <div className="flex justify-between text-3xs text-muted-foreground">
        <span>{BAR_LO}%</span>
        <span>even</span>
        <span>{BAR_HI}%</span>
      </div>
    </Stack>
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
  // `/v1/matches/{id}/metadata` reports the badge per team, not per player, so it belongs here.
  const { data: ranks = [] } = useQuery({ ...ranksQueryOptions, enabled: badge !== undefined });

  return (
    <div className={cn("flex items-center gap-2", !ally && "flex-row-reverse")}>
      <TeamEmblem side={side} className={cn("size-7", ally ? "text-positive" : "text-primary")} />
      <span className={cn("text-sm font-semibold", ally ? "text-positive" : "text-primary")}>{TEAM_NAMES[side]}</span>
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

  const { margin } = analysis;
  const decimals = margin !== undefined && margin > COARSE_MARGIN ? 0 : 1;

  const lanes = lanesOf(draft.gameMode);

  const renderSlot = (side: Side, slot: number, lane?: LaneInfo) => (
    <DraftSlot
      key={`${side}-${slot}`}
      heroId={draft[side][slot] ?? null}
      slot={slot}
      side={side}
      lane={lane}
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
  );

  const renderSide = (side: Side) => {
    const laneSuggestion = laneSuggestions[side];
    return (
      <Stack gap={2} className="flex-1">
        <SideHeader side={side} badge={imported?.badges[side]} />
        {lanes.length === 0 ? (
          // No lanes to group by, so the side is one row of interchangeable slots.
          <Card tone="glass" size="xs" className="flex-row items-start justify-center gap-1.5 p-1.5">
            {Array.from({ length: TEAM_SIZE[draft.gameMode] }, (_, slot) => renderSlot(side, slot))}
          </Card>
        ) : (
          /* One boxed group per lane: the two slots that share a box are the two heroes that share a
          lane, which is what the slot ordering encodes. */
          <div className="grid grid-cols-3 gap-2">
            {lanes.map((lane, laneIndex) => (
              <Card key={lane.id} tone="glass" size="xs" accent={lane.color} className="@container gap-1 p-1.5">
                <div className={cn("text-center text-3xs font-semibold", lane.textClass)}>{lane.name}</div>
                {/* A phone leaves a lane card too narrow for two full-size slots side by side, so they stack. */}
                <div className="flex flex-col justify-center gap-1.5 @slot-pair:flex-row @slot-pair:items-start">
                  {slotsOfLane(laneIndex).map((slot) => renderSlot(side, slot, lane))}
                </div>
              </Card>
            ))}
          </div>
        )}
        {laneSuggestion && (
          <LaneSwapBanner
            suggestion={laneSuggestion}
            side={side}
            onApply={() => reorderSide(side, laneSuggestion.slots)}
          />
        )}
      </Stack>
    );
  };

  return (
    // Side-by-side only from 2xl: the centre column is a fixed ~280px, so a row any earlier leaves
    // each six-slot side under 40px per portrait.
    <div className="flex flex-col items-stretch gap-5 2xl:flex-row 2xl:items-stretch 2xl:gap-6">
      {renderSide("ally")}

      <Stack gap={2.5} align="center" className="flex-none px-3 text-center">
        <Stack gap={0} align="center">
          <div className="eyebrow">Predicted</div>
          {loading ? (
            // One line of `text-4xl`, so the number replaces it without moving the board.
            <Skeleton className="h-10 w-28" />
          ) : (
            // Both sides, each in its own team colour, so the split reads without doing the
            // subtraction. The favoured side is simply the larger number.
            <Inline
              gap={1.5}
              align="baseline"
              justify="center"
              wrap="nowrap"
              className="text-4xl font-bold tracking-tight tabular-nums"
            >
              {analysis.predicted === undefined ? (
                NO_DATA
              ) : (
                <>
                  <span className="text-positive">{analysis.predicted.toFixed(decimals)}%</span>
                  <span className="text-muted-foreground">:</span>
                  <span className="text-primary">{(100 - analysis.predicted).toFixed(decimals)}%</span>
                </>
              )}
            </Inline>
          )}
        </Stack>

        {loading || analysis.margin === undefined || analysis.predicted === undefined ? (
          // Holds the bar's height until there is a prediction, so the first one does not push the board down.
          <div aria-hidden="true" className="invisible">
            <IntervalBar predicted={(BAR_LO + BAR_HI) / 2} margin={0} />
          </div>
        ) : (
          <StatTooltip
            title="How firm is this number?"
            rows={[
              {
                label: "Range",
                value: `${(analysis.predicted - analysis.margin).toFixed(1)}% to ${(analysis.predicted + analysis.margin).toFixed(1)}%`,
              },
              { label: "Confidence", value: CONFIDENCE_LABEL(analysis.margin) },
              { label: "Margin", value: `±${analysis.margin.toFixed(1)} pts` },
            ]}
          >
            <TooltipTarget>
              <IntervalBar predicted={analysis.predicted} margin={analysis.margin} />
            </TooltipTarget>
          </StatTooltip>
        )}

        {!loading && (
          <Stack gap={2.5} className="w-64">
            <Separator />
            <Stack gap={2}>
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
                      { label: TEAM_NAMES.ally, value: formatPoints(contribution.ally) },
                      { label: TEAM_NAMES.enemy, value: formatPoints(contribution.enemy) },
                      { label: "Thinnest sample", value: formatCount(contribution.matches) },
                      { label: "Confidence", value: `${filledPips} of ${MAX_CONFIDENCE_PIPS}` },
                    ]}
                  >
                    <TooltipTarget className="flex w-full items-center gap-2 text-2xs">
                      <span className="flex-1 text-start text-muted-foreground">{contribution.label}</span>
                      <Pips
                        value={filledPips}
                        max={MAX_CONFIDENCE_PIPS}
                        tone={pipTone(filledPips)}
                        label={`Confidence ${filledPips} of ${MAX_CONFIDENCE_PIPS}`}
                        className="shrink-0"
                      />
                      {/* Fixed tracks: a wider number would push the pips left and leave the four
                          rows' meters out of line with each other. */}
                      <span className="flex shrink-0 items-center gap-2 text-2xs font-semibold">
                        {(["ally", "enemy"] as const).map((side) => (
                          <span key={side} className="flex w-12 items-center gap-1">
                            <TeamEmblem side={side} className="size-3 shrink-0 text-muted-foreground" />
                            <span className="sr-only">{TEAM_NAMES[side]}</span>
                            <Points value={contribution[side]} align="end" className="flex-1 font-semibold" />
                          </span>
                        ))}
                      </span>
                    </TooltipTarget>
                  </StatTooltip>
                );
              })}
            </Stack>
          </Stack>
        )}
      </Stack>

      {renderSide("enemy")}
    </div>
  );
}
