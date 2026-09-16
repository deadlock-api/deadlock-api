import { Flag, Skull } from "lucide-react";
import { type Ref, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { FightSummary } from "~/lib/tracker/fights";
import type { ObjectiveEvent } from "~/lib/tracker/objectives";
import type { SoulLead } from "~/lib/tracker/soul-lead";
import { TEAMS } from "~/lib/tracker/teams";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_COLOR, LOSS_TEXT_CLASS, WIN_COLOR, WIN_TEXT_CLASS } from "../shared/colors";
import { TooltipHeader, TooltipStat, TooltipStats } from "../shared/PanelTooltipContent";
import { MatchEventList } from "./MatchEventList";
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
  players,
  onViewPlayer,
  viewedIsAlly,
  durationS,
  nameOf,
}: {
  ref?: Ref<HTMLElement>;
  /** Null when neither team ever led, as in Street Brawl. */
  lead: SoulLead | null;
  objectives: ObjectiveEvent[];
  /** The viewed player's kills and deaths. */
  fights: FightSummary | null;
  /** The player whose kills and deaths the chart plots, which the scoreboard picks. */
  viewed: TrackerMatchPlayer | undefined;
  players: TrackerMatchPlayer[];
  onViewPlayer: (accountId: number) => void;
  /** Whether the viewed player is on the tracked player's team, whose side the chart takes. */
  viewedIsAlly: boolean;
  durationS: number;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const [visibleLayers, setVisibleLayers] = useState(["kill", "death", "dead", "objective"]);
  const killTextClass = viewedIsAlly ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS;
  const deathTextClass = viewedIsAlly ? LOSS_TEXT_CLASS : WIN_TEXT_CLASS;
  const viewedName = viewed ? nameOf(viewed) : "them";
  const events: TimelineEvent[] = [
    ...(fights?.kills ?? []).map((kill) => ({
      time: kill.time,
      kind: "kill" as const,
      title: nameOf(kill.victim),
      hero: kill.victim,
      // An enemy's kill is a loss for the tracked team, so it sits below the line with the team's other losses.
      side: viewedIsAlly ? ("gain" as const) : ("loss" as const),
      tooltip: (
        <>
          <TooltipHeader
            lead={<HeroImage heroId={kill.victim.hero_id} className="size-8 shrink-0 rounded-full" title="" />}
            title={nameOf(kill.victim)}
            subtitle={<span className={killTextClass}>Killed by {viewedName}</span>}
          />
          <TooltipStats>
            <TooltipStat label="Match time" value={formatMatchDuration(kill.time)} />
          </TooltipStats>
        </>
      ),
    })),
    ...(fights?.deaths ?? []).map((death) => ({
      time: death.time,
      kind: "death" as const,
      title: death.killer ? `Killed by ${nameOf(death.killer)}` : "No player credited",
      description: `Time to kill: ${Math.round(death.timeToKillS)}s · ${death.endedAtMatchEnd ? `Dead until match end (${death.deadForS}s)` : `Respawned after ${death.deadForS}s`}`,
      hero: death.killer,
      side: viewedIsAlly ? ("loss" as const) : ("gain" as const),
      tooltip: (
        <>
          <TooltipHeader
            lead={
              death.killer ? (
                <HeroImage heroId={death.killer.hero_id} className="size-8 shrink-0 rounded-full" title="" />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Skull className="size-4 text-muted-foreground" />
                </span>
              )
            }
            title={death.killer ? nameOf(death.killer) : "No player credited"}
            subtitle={<span className={deathTextClass}>Killed {viewedName}</span>}
          />
          <TooltipStats>
            <TooltipStat label="Match time" value={formatMatchDuration(death.time)} />
            <TooltipStat label="Time to kill" value={`${Math.round(death.timeToKillS)}s`} />
            <TooltipStat
              label={death.endedAtMatchEnd ? "Dead until match end" : "Respawned after"}
              value={`${death.deadForS}s`}
            />
          </TooltipStats>
        </>
      ),
    })),
  ].toSorted((a, b) => a.time - b.time);
  const deadWindows = (fights?.deaths ?? []).map((death) => ({
    start: Math.max(0, death.time),
    end: Math.max(0, death.time) + death.deadForS,
  }));

  if (durationS <= 0 || (!lead && events.length === 0 && objectives.length === 0)) return null;
  const taken = objectives.filter((event) => event.own).length;
  const killColor = viewedIsAlly ? WIN_COLOR : LOSS_COLOR;
  const deathColor = viewedIsAlly ? LOSS_COLOR : WIN_COLOR;

  return (
    <section
      ref={ref}
      aria-label="Match timeline"
      tabIndex={-1}
      className="scroll-mt-4 space-y-1 rounded-md border border-border px-3 pt-2 pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span className="text-sm font-semibold text-foreground">Match timeline</span>
        {lead && <span>Ahead for {Math.round(lead.aheadShare * 100)}% of the match</span>}
        {objectives.length > 0 && (
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
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {viewed && (
            <Select value={String(viewed.account_id)} onValueChange={(value) => onViewPlayer(Number(value))}>
              <SelectTrigger
                size="sm"
                aria-label="Player shown on match timeline"
                className="max-w-48 min-w-0 gap-1 px-1.5 py-0 data-[size=sm]:h-6"
              >
                <SelectValue>
                  <HeroImage heroId={viewed.hero_id} className="size-4 shrink-0 rounded-full" title="" />
                  <span className="max-w-32 truncate">{nameOf(viewed)}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)]">
                {TEAMS.map((team) => (
                  <SelectGroup key={team.key}>
                    <SelectLabel>{team.name}</SelectLabel>
                    {players
                      .filter((player) => player.team === team.key)
                      .map((player) => (
                        <SelectItem
                          key={player.account_id}
                          value={String(player.account_id)}
                          textValue={nameOf(player)}
                        >
                          <HeroImage heroId={player.hero_id} className="size-5 shrink-0 rounded-full" title="" />
                          <span className="max-w-48 truncate">{nameOf(player)}</span>
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
          <ToggleGroup
            type="multiple"
            value={visibleLayers}
            onValueChange={setVisibleLayers}
            aria-label="Match timeline layers"
            size="sm"
            spacing={1}
          >
            <ToggleGroupItem
              value="kill"
              aria-label="Show kills on timeline"
              title="Show or hide kills"
              className="h-6 gap-1 px-1.5 text-xs data-[state=off]:line-through"
            >
              <LegendSwatch color={killColor} label="Kill" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="death"
              aria-label="Show deaths on timeline"
              title="Show or hide deaths"
              className="h-6 gap-1 px-1.5 text-xs data-[state=off]:line-through"
            >
              <LegendSwatch color={deathColor} label="Death" />
            </ToggleGroupItem>
            {deadWindows.length > 0 && (
              <ToggleGroupItem
                value="dead"
                aria-label="Show time dead on timeline"
                title="Show or hide time dead"
                className="h-6 gap-1 px-1.5 text-xs data-[state=off]:line-through"
              >
                <span className="h-2.5 w-3 rounded-sm" style={{ backgroundColor: deathColor, opacity: 0.2 }} />
                Dead
              </ToggleGroupItem>
            )}
            {objectives.length > 0 && (
              <ToggleGroupItem
                value="objective"
                aria-label="Show objectives on timeline"
                title="Show or hide objectives"
                className="h-6 gap-1 px-1.5 text-xs data-[state=off]:line-through"
              >
                <Flag className="size-3" />
                Obj
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        </div>
      </div>
      <MatchTimelineChart
        lead={lead}
        objectives={visibleLayers.includes("objective") ? objectives : []}
        events={events.filter((event) => visibleLayers.includes(event.kind))}
        deadWindows={visibleLayers.includes("dead") ? deadWindows : []}
        deadWindowColor={deathColor}
        durationS={durationS}
      />
      <MatchEventList combat={events} objectives={objectives} playerName={viewedName} />
    </section>
  );
}
