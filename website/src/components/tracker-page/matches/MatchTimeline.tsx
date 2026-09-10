import { formatMatchDuration } from "~/lib/tracker/compute";
import type { FightSummary } from "~/lib/tracker/fights";
import type { ObjectiveEvent } from "~/lib/tracker/objectives";
import type { SoulLead } from "~/lib/tracker/soul-lead";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { KillsDeathsTrack } from "./KillsDeathsTrack";
import { formatLead, SoulLeadChart, TIMELINE_END_PX, TIMELINE_GUTTER_PX, timelineTicks } from "./SoulLeadChart";

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The team soul lead and the tracked player's kills and deaths over one shared match-time axis. */
export function MatchTimeline({
  lead,
  events,
  fights,
  durationS,
  nameOf,
}: {
  /** Null when neither team ever led, as in Street Brawl. */
  lead: SoulLead | null;
  events: ObjectiveEvent[];
  fights: FightSummary | null;
  durationS: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const hasFights = fights != null && fights.kills.length + fights.deaths.length > 0;
  if (durationS <= 0 || (!lead && !hasFights)) return null;
  const ticks = timelineTicks(durationS);
  const taken = events.filter((event) => event.own).length;

  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <span className="text-sm font-semibold text-foreground">Match timeline</span>
        {lead && <span>Ahead for {Math.round(lead.aheadShare * 100)}% of the match</span>}
        {lead && events.length > 0 && (
          <span title="Objectives destroyed and mid bosses claimed by your team, then by the enemy">
            Objectives <span className={cn("font-semibold", WIN_TEXT_CLASS)}>{taken}</span> –{" "}
            <span className={cn("font-semibold", LOSS_TEXT_CLASS)}>{events.length - taken}</span>
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
        {fights && (
          <span>
            {count(fights.kills.length, "kill")} · {count(fights.deaths.length, "death")}
            {fights.deaths.length > 0 &&
              ` · ${formatMatchDuration(fights.deadForS)} dead (${Math.round((fights.deadForS / durationS) * 100)}%)`}
          </span>
        )}
      </div>
      <div>
        {lead && <SoulLeadChart lead={lead} events={events} durationS={durationS} timeTicks={ticks} />}
        {hasFights && <KillsDeathsTrack fights={fights} durationS={durationS} timeTicks={ticks} nameOf={nameOf} />}
        <div
          className="relative h-4"
          style={{ marginLeft: TIMELINE_GUTTER_PX, marginRight: TIMELINE_END_PX }}
          aria-hidden
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute top-1 -translate-x-1/2 text-[10px] leading-none text-muted-foreground tabular-nums"
              style={{ left: `${(tick / durationS) * 100}%` }}
            >
              {Math.round(tick / 60)}m
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
