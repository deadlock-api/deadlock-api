import { ArrowDownUp, ChevronRight, Flag, Skull, Swords } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { IconTile } from "~/components/ui/icon-tile";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { TONE_TEXT } from "~/lib/tone";
import { formatMatchDuration } from "~/lib/tracker/compute";
import { describeObjectiveOutcome, OBJECTIVE_LABELS, type ObjectiveEvent } from "~/lib/tracker/objectives";
import { cn } from "~/lib/utils";

import type { TimelineEvent } from "./MatchTimelineChart";

/** A readable alternative to the chart's hover details, including coincident events. */
export function MatchEventList({
  combat,
  objectives,
  playerName,
}: {
  combat: TimelineEvent[];
  objectives: ObjectiveEvent[];
  playerName: string;
}) {
  const [filter, setFilter] = useState("all");
  const [latestFirst, setLatestFirst] = useState(false);
  const events = [
    ...combat,
    ...objectives.map((event) => ({
      time: event.time,
      kind: "objective" as const,
      title: OBJECTIVE_LABELS[event.kind],
      description: describeObjectiveOutcome(event),
      side: event.own ? ("gain" as const) : ("loss" as const),
      hero: null,
    })),
  ].toSorted((a, b) => (a.time - b.time) * (latestFirst ? -1 : 1));
  if (events.length === 0) return null;
  const visible = events.filter(
    (event) => filter === "all" || (filter === "combat" ? event.kind !== "objective" : event.kind === filter),
  );

  return (
    <Collapsible className="flex flex-col gap-1">
      <Separator />
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group w-full justify-start">
          <ChevronRight data-icon="inline-start" className="group-data-[state=open]:rotate-90" />
          Event list
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">{events.length}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-1 pb-3">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 flex-1 text-xs wrap-anywhere text-muted-foreground">
            Combat events for <span className="font-medium text-foreground">{playerName}</span>. Objectives are shown
            from your team’s perspective.
          </p>
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger size="sm" aria-label="Filter timeline events" className="min-w-0 flex-1 sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="combat">Combat</SelectItem>
                  <SelectItem value="kill">Kills</SelectItem>
                  <SelectItem value="death">Deaths</SelectItem>
                  <SelectItem value="objective">Objectives</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant={latestFirst ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Latest timeline events first"
              aria-pressed={latestFirst}
              title={latestFirst ? "Show earliest events first" : "Show latest events first"}
              onClick={() => setLatestFirst((value) => !value)}
            >
              <ArrowDownUp />
            </Button>
          </div>
        </div>
        <output className="text-xs text-muted-foreground tabular-nums">
          {visible.length} {visible.length === 1 ? "event" : "events"} · {latestFirst ? "latest" : "earliest"} first
        </output>
        {visible.length === 0 ? (
          <EmptyState variant="inline" className="py-4" title={`No ${filter} events recorded.`} />
        ) : (
          <Card
            asChild
            key={`${filter}-${playerName}-${latestFirst}`}
            tone="outline"
            size="flush"
            radius="md"
            className="max-h-72 overflow-y-auto overscroll-contain"
          >
            <section
              aria-label="Chronological match events"
              // Keyboard users need to focus the scroll region to read events beyond its visible height.
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
            >
              <ol>
                {visible.map((event, index) => {
                  const Icon = event.kind === "objective" ? Flag : event.kind === "kill" ? Swords : Skull;
                  return (
                    // Events can share a time, hero and kind (for example, simultaneous guardians).
                    // oxlint-disable-next-line react/no-array-index-key
                    <li key={`${event.time}-${event.kind}-${index}`} className="flex flex-col">
                      {index > 0 && <Separator />}
                      <div className="flex items-start gap-2 px-3 py-2 text-xs">
                        <span className="w-10 shrink-0 pt-0.5 font-medium tabular-nums">
                          {formatMatchDuration(event.time)}
                        </span>
                        <span aria-hidden className="shrink-0 pt-0.5">
                          {event.hero ? (
                            <HeroImage heroId={event.hero.hero_id} shape="circle" className="size-6" title="" />
                          ) : (
                            <IconTile size="xs" shape="circle">
                              <Icon />
                            </IconTile>
                          )}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5 wrap-anywhere">
                          <p>
                            <span
                              className={cn(
                                "font-semibold",
                                TONE_TEXT[event.side === "gain" ? "positive" : "negative"],
                              )}
                            >
                              {event.kind === "kill" ? "Kill" : event.kind === "death" ? "Death" : "Objective"}
                            </span>{" "}
                            {event.title}
                          </p>
                          {event.description && <p className="text-muted-foreground">{event.description}</p>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </Card>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
