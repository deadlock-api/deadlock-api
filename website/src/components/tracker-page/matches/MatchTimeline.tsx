import type { Ref } from "react";

import { HeroImage } from "~/components/HeroImage";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { FightSummary } from "~/lib/tracker/fights";
import type { ObjectiveEvent } from "~/lib/tracker/objectives";
import type { SoulLead } from "~/lib/tracker/soul-lead";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_COLOR, LOSS_TEXT_CLASS, WIN_COLOR, WIN_TEXT_CLASS } from "../shared/colors";
import { formatLead, MatchTimelineChart, type TimelineEvent } from "./MatchTimelineChart";

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2.5 rounded-full" style={{ boxShadow: `0 0 0 1.5px ${color}` }} />
      {label}
    </span>
  );
}

/** The team soul lead and one player's kills and deaths in one chart over the match. */
export function MatchTimeline({
  ref,
  lead,
  objectives,
  fights,
  viewed,
  viewedIsAlly,
  durationS,
  nameOf,
}: {
  ref?: Ref<HTMLDivElement>;
  /** Null when neither team ever led, as in Street Brawl. */
  lead: SoulLead | null;
  objectives: ObjectiveEvent[];
  /** The viewed player's kills and deaths. */
  fights: FightSummary | null;
  /** The player whose kills and deaths the chart plots, which the scoreboard picks. */
  viewed: TrackerMatchPlayer | undefined;
  /** Whether the viewed player is on the tracked player's team, whose side the chart takes. */
  viewedIsAlly: boolean;
  durationS: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const events: TimelineEvent[] = [
    ...(fights?.kills ?? []).map((kill) => ({
      time: kill.time,
      hero: kill.victim,
      // An enemy's kill is a loss for the tracked team, so it sits below the line with the team's other losses.
      side: viewedIsAlly ? ("gain" as const) : ("loss" as const),
      tooltip: `Killed ${nameOf(kill.victim)} at ${formatMatchDuration(kill.time)}`,
    })),
    ...(fights?.deaths ?? []).map((death) => ({
      time: death.time,
      hero: death.killer,
      side: viewedIsAlly ? ("loss" as const) : ("gain" as const),
      tooltip: `${death.killer ? `Killed by ${nameOf(death.killer)}` : "Killed by a non-player"} at ${formatMatchDuration(death.time)} in ${Math.round(death.timeToKillS)}s · respawned after ${death.deadForS}s`,
    })),
  ].toSorted((a, b) => a.time - b.time);
  const deadWindows = (fights?.deaths ?? []).map((death) => ({ start: death.time, end: death.time + death.deadForS }));

  if (durationS <= 0 || (!lead && events.length === 0)) return null;
  const taken = objectives.filter((event) => event.own).length;
  const killColor = viewedIsAlly ? WIN_COLOR : LOSS_COLOR;
  const deathColor = viewedIsAlly ? LOSS_COLOR : WIN_COLOR;

  return (
    <div ref={ref} className="scroll-mt-4 space-y-1 rounded-md border border-border px-3 pt-2 pb-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span className="text-sm font-semibold text-foreground">Match timeline</span>
        {lead && <span>Ahead for {Math.round(lead.aheadShare * 100)}% of the match</span>}
        {lead && objectives.length > 0 && (
          <span title="Objectives destroyed and mid bosses claimed by your team, then by the enemy">
            Objectives <span className={cn("font-semibold", WIN_TEXT_CLASS)}>{taken}</span> –{" "}
            <span className={cn("font-semibold", LOSS_TEXT_CLASS)}>{objectives.length - taken}</span>
          </span>
        )}
        {lead && lead.peak.lead > 0 && (
          <span>
            Peak <span className={cn("font-semibold", WIN_TEXT_CLASS)}>{formatLead(lead.peak.lead)}</span> at{" "}
            {formatMatchDuration(lead.peak.time)}
          </span>
        )}
        {lead && lead.trough.lead < 0 && (
          <span>
            Low <span className={cn("font-semibold", LOSS_TEXT_CLASS)}>{formatLead(lead.trough.lead)}</span> at{" "}
            {formatMatchDuration(lead.trough.time)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {viewed && (
            <span className="flex items-center gap-1.5 text-foreground">
              <HeroImage heroId={viewed.hero_id} className="size-4 rounded-full" title="" />
              <span className="max-w-32 truncate">{nameOf(viewed)}</span>
            </span>
          )}
          <span className="flex items-center gap-3" aria-hidden>
            <LegendSwatch color={killColor} label="Kill" />
            <LegendSwatch color={deathColor} label="Death" />
            {deadWindows.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-3 rounded-sm" style={{ backgroundColor: deathColor, opacity: 0.2 }} />
                Dead
              </span>
            )}
          </span>
        </span>
      </div>
      <MatchTimelineChart
        lead={lead}
        objectives={objectives}
        events={events}
        deadWindows={deadWindows}
        deadWindowColor={deathColor}
        durationS={durationS}
      />
    </div>
  );
}
