import { ArrowDownUp, ChevronRight, Flag, Skull, Swords } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Empty, EmptyDescription } from "~/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { formatMatchDuration } from "~/lib/tracker/compute";
import { describeObjectiveOutcome, OBJECTIVE_LABELS, type ObjectiveEvent } from "~/lib/tracker/objectives";
import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
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
    <Collapsible className="border-t border-border pt-1">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group w-full justify-start">
          <ChevronRight data-icon="inline-start" className="transition-transform group-data-[state=open]:rotate-90" />
          Event list
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{events.length}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-2 pb-3">
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
          <Empty className="py-4">
            <EmptyDescription>No {filter} events recorded.</EmptyDescription>
          </Empty>
        ) : (
          <section
            key={`${filter}-${playerName}-${latestFirst}`}
            aria-label="Chronological match events"
            // Keyboard users need to focus the scroll region to read events beyond its visible height.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="max-h-72 overflow-y-auto overscroll-contain rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ol className="divide-y divide-border">
              {visible.map((event, index) => {
                const Icon = event.kind === "objective" ? Flag : event.kind === "kill" ? Swords : Skull;
                return (
                  // Events can share a time, hero and kind (for example, simultaneous guardians).
                  // oxlint-disable-next-line react/no-array-index-key
                  <li key={`${event.time}-${event.kind}-${index}`} className="flex items-start gap-2 px-3 py-2 text-xs">
                    <span className="w-10 shrink-0 pt-0.5 font-medium tabular-nums">
                      {formatMatchDuration(event.time)}
                    </span>
                    <span aria-hidden className="shrink-0 pt-0.5">
                      {event.hero ? (
                        <HeroImage heroId={event.hero.hero_id} className="size-6 rounded-full" title="" />
                      ) : (
                        <Icon className="m-1 size-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5 wrap-anywhere">
                      <p>
                        <span
                          className={cn(
                            "mr-1.5 font-semibold",
                            event.side === "gain" ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS,
                          )}
                        >
                          {event.kind === "kill" ? "Kill" : event.kind === "death" ? "Death" : "Objective"}
                        </span>{" "}
                        {event.title}
                      </p>
                      {event.description && <p className="text-muted-foreground">{event.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
