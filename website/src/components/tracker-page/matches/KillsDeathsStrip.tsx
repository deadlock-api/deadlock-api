import { Skull } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { FightSummary } from "~/lib/tracker/fights";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_COLOR } from "../shared/colors";

const CHIP_PX = 24;
const CHIP_GAP_PX = 2;
const LEVEL_PX = CHIP_PX + CHIP_GAP_PX;
const AXIS_PX = 10;
const TICK_LABEL_PX = 16;
const MIN_TICK_SPACING_PX = 48;
const TICK_STEPS_S = [300, 600, 900, 1200];

interface PlacedChip {
  left: number;
  level: number;
}

/**
 * Places time-sorted events on a track `widthPx` wide. A chip takes the lowest stack level
 * free at its position, so chips closer than a chip's width stack instead of overlapping.
 */
function placeChips(times: number[], durationS: number, widthPx: number): PlacedChip[] {
  const levelEnds: number[] = [];
  return times.map((time) => {
    const left = Math.min(Math.max((time / durationS) * widthPx - CHIP_PX / 2, 0), widthPx - CHIP_PX);
    let level = levelEnds.findIndex((end) => end <= left);
    if (level === -1) level = levelEnds.length;
    levelEnds[level] = left + LEVEL_PX;
    return { left, level };
  });
}

const levelCount = (chips: PlacedChip[]) => chips.reduce((max, chip) => Math.max(max, chip.level + 1), 0);

function EventChip({
  player,
  left,
  top,
  className,
  tooltip,
}: {
  player: TrackerMatchPlayer | null;
  left: number;
  top: number;
  className: string;
  tooltip: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("absolute size-6 rounded-full ring-1", className)} style={{ left, top }}>
          {player ? (
            <HeroImage heroId={player.hero_id} className="size-6 rounded-full" />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-full bg-muted">
              <Skull className="size-3.5 text-muted-foreground" />
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The tracked player's kills above and deaths below one match-time axis, with the time spent dead shaded on it. */
export function KillsDeathsStrip({
  fights,
  matchDurationS,
  nameOf,
}: {
  fights: FightSummary;
  matchDurationS: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const { kills, deaths, deadForS } = fights;
  const deadShare = matchDurationS > 0 ? Math.round((deadForS / matchDurationS) * 100) : 0;

  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const hasEvents = matchDurationS > 0 && kills.length + deaths.length > 0;
  const killChips =
    width > 0
      ? placeChips(
          kills.map((kill) => kill.time),
          matchDurationS,
          width,
        )
      : [];
  const deathChips =
    width > 0
      ? placeChips(
          deaths.map((death) => death.time),
          matchDurationS,
          width,
        )
      : [];
  const killsHeight = kills.length > 0 ? Math.max(1, levelCount(killChips)) * LEVEL_PX : 0;
  const deathsHeight = deaths.length > 0 ? Math.max(1, levelCount(deathChips)) * LEVEL_PX : 0;
  const axisTop = killsHeight;
  const deathsTop = axisTop + AXIS_PX;
  const plotHeight = deathsTop + deathsHeight;

  const xOf = (time: number) => (time / matchDurationS) * width;
  const tickStep =
    TICK_STEPS_S.find((step) => xOf(step) >= MIN_TICK_SPACING_PX) ?? TICK_STEPS_S[TICK_STEPS_S.length - 1];
  const ticks: number[] = [];
  for (let tick = tickStep; tick < matchDurationS; tick += tickStep) ticks.push(tick);

  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold whitespace-nowrap">Kills & deaths</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count(kills.length, "kill")} · {count(deaths.length, "death")}
          {deaths.length > 0 && ` · ${formatMatchDuration(deadForS)} dead · ${deadShare}% of the match`}
        </span>
      </div>
      {hasEvents && (
        <div className="flex">
          <div className="relative w-12 shrink-0 text-xs text-muted-foreground">
            {kills.length > 0 && (
              <span className="absolute flex items-center" style={{ top: 0, height: killsHeight }}>
                Kills
              </span>
            )}
            {deaths.length > 0 && (
              <span className="absolute flex items-center" style={{ top: deathsTop, height: deathsHeight }}>
                Deaths
              </span>
            )}
          </div>
          <div ref={trackRef} className="relative min-w-0 flex-1" style={{ height: plotHeight + TICK_LABEL_PX }}>
            {width > 0 && (
              <>
                {ticks.map((tick) => (
                  <div key={tick}>
                    <div
                      aria-hidden
                      className="absolute w-px bg-border"
                      style={{ left: xOf(tick), top: 0, height: plotHeight }}
                    />
                    <span
                      className="absolute -translate-x-1/2 text-[10px] leading-none text-muted-foreground tabular-nums"
                      style={{ left: xOf(tick), top: plotHeight + 4 }}
                    >
                      {Math.round(tick / 60)}m
                    </span>
                  </div>
                ))}
                <div
                  aria-hidden
                  className="absolute inset-x-0 h-px bg-muted-foreground/60"
                  style={{ top: axisTop + AXIS_PX / 2 }}
                />
                {deaths.map((death) => (
                  <div
                    key={death.time}
                    aria-hidden
                    className="absolute h-1 rounded-full"
                    style={{
                      left: xOf(death.time),
                      width: Math.max(2, xOf(Math.min(death.deadForS, matchDurationS - death.time))),
                      top: axisTop + AXIS_PX / 2 - 2,
                      backgroundColor: LOSS_COLOR,
                      opacity: 0.7,
                    }}
                  />
                ))}
                {kills.map((kill, index) => (
                  <EventChip
                    key={`${kill.victim.account_id}-${kill.time}`}
                    player={kill.victim}
                    left={killChips[index].left}
                    top={axisTop - (killChips[index].level + 1) * LEVEL_PX + CHIP_GAP_PX}
                    className="ring-emerald-500/70"
                    tooltip={`Killed ${nameOf(kill.victim)} at ${formatMatchDuration(kill.time)}`}
                  />
                ))}
                {deaths.map((death, index) => (
                  <EventChip
                    key={death.time}
                    player={death.killer}
                    left={deathChips[index].left}
                    top={deathsTop + deathChips[index].level * LEVEL_PX}
                    className="ring-primary/70"
                    tooltip={
                      <>
                        {death.killer ? `Killed by ${nameOf(death.killer)}` : "Killed by a non-player"} at{" "}
                        {formatMatchDuration(death.time)} in {Math.round(death.timeToKillS)}s · respawned after{" "}
                        {death.deadForS}s
                      </>
                    }
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
