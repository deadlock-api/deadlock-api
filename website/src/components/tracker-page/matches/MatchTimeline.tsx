import { useState } from "react";

import { Segmented } from "~/components/Segmented";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { FightSummary, MatchKill } from "~/lib/tracker/fights";
import type { ObjectiveEvent } from "~/lib/tracker/objectives";
import type { SoulLead } from "~/lib/tracker/soul-lead";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_COLOR, LOSS_TEXT_CLASS, WIN_COLOR, WIN_TEXT_CLASS } from "../shared/colors";
import { type DeadWindow, formatLead, MatchTimelineChart, type TimelineEvent } from "./MatchTimelineChart";

type KillScope = "all" | "you";

const KILL_SCOPES = [
  { value: "all", label: "All kills" },
  { value: "you", label: "Yours" },
] as const;

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2.5 rounded-full" style={{ boxShadow: `0 0 0 1.5px ${color}` }} />
      {label}
    </span>
  );
}

/** The team soul lead and the match's kills in one chart, narrowed to the tracked player's own on request. */
export function MatchTimeline({
  lead,
  objectives,
  fights,
  matchKills,
  ownTeam,
  durationS,
  nameOf,
}: {
  /** Null when neither team ever led, as in Street Brawl. */
  lead: SoulLead | null;
  objectives: ObjectiveEvent[];
  /** The tracked player's kills and deaths. */
  fights: FightSummary | null;
  /** Every hero death in the match. */
  matchKills: MatchKill[] | null;
  ownTeam: string;
  durationS: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const [scope, setScope] = useState<KillScope>("all");
  const showAll = scope === "all" && matchKills != null;

  const events: TimelineEvent[] = showAll
    ? matchKills.map((kill) => ({
        time: kill.time,
        hero: kill.victim,
        side: kill.victim.team === ownTeam ? "loss" : "gain",
        tooltip: `${kill.killer ? nameOf(kill.killer) : "A non-player"} killed ${nameOf(kill.victim)} at ${formatMatchDuration(kill.time)}`,
      }))
    : [
        ...(fights?.kills ?? []).map((kill) => ({
          time: kill.time,
          hero: kill.victim,
          side: "gain" as const,
          tooltip: `Killed ${nameOf(kill.victim)} at ${formatMatchDuration(kill.time)}`,
        })),
        ...(fights?.deaths ?? []).map((death) => ({
          time: death.time,
          hero: death.killer,
          side: "loss" as const,
          tooltip: `${death.killer ? `Killed by ${nameOf(death.killer)}` : "Killed by a non-player"} at ${formatMatchDuration(death.time)} in ${Math.round(death.timeToKillS)}s · respawned after ${death.deadForS}s`,
        })),
      ].toSorted((a, b) => a.time - b.time);
  const deadWindows: DeadWindow[] = (fights?.deaths ?? []).map((death) => ({
    start: death.time,
    end: death.time + death.deadForS,
  }));

  if (durationS <= 0 || (!lead && events.length === 0)) return null;
  const taken = objectives.filter((event) => event.own).length;

  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-2">
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
        {matchKills && (
          <Segmented
            value={scope}
            onValueChange={setScope}
            options={KILL_SCOPES}
            aria-label="Kills shown"
            className="ml-auto w-auto text-xs [&>*]:px-2 [&>*]:py-0.5"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {fights && (
          <span>
            You: {count(fights.kills.length, "kill")} · {count(fights.deaths.length, "death")}
            {fights.deaths.length > 0 &&
              ` · ${formatMatchDuration(fights.deadForS)} dead (${Math.round((fights.deadForS / durationS) * 100)}%)`}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3" aria-hidden>
          <LegendSwatch color={WIN_COLOR} label={showAll ? "Enemy died" : "Your kill"} />
          <LegendSwatch color={LOSS_COLOR} label={showAll ? "Ally died" : "Your death"} />
          {deadWindows.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-3 rounded-sm" style={{ backgroundColor: LOSS_COLOR, opacity: 0.2 }} />
              You dead
            </span>
          )}
        </span>
      </div>
      <MatchTimelineChart
        lead={lead}
        objectives={objectives}
        events={events}
        deadWindows={deadWindows}
        durationS={durationS}
      />
    </div>
  );
}
