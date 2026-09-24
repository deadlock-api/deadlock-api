import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListOrdered, Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { Button } from "~/components/ui/button";
import { CornerBadge } from "~/components/ui/corner-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Separator } from "~/components/ui/separator";
import { buildTimeline, type BuildEvent, type PlayerBuild } from "~/lib/tracker/build";
import { formatMatchDuration } from "~/lib/tracker/compute";

const EVENT_INFO = {
  unlock: { label: "Unlock", icon: Plus },
  upgrade: { label: "Upgrade", icon: ArrowUp },
  purchase: { label: "Buy", icon: Plus },
  sale: { label: "Sell", icon: ArrowDown },
};

function eventName(event: BuildEvent) {
  return "ability" in event ? event.ability.name : event.item.upgrade.name;
}

function EventImage({ event }: { event: BuildEvent }) {
  return "ability" in event ? (
    <AbilityImage abilityId={event.ability.id} className="size-6" title="" />
  ) : (
    <ItemImage item={event.item.upgrade} className="size-6" title="" />
  );
}

function BuildTimeline({ events, playerName }: { events: BuildEvent[]; playerName: string }) {
  const gridRef = useRef<HTMLOListElement>(null);
  const [layout, setLayout] = useState({ columns: 8, capacity: 48 });
  const [selected, setSelected] = useState(0);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const columns = Math.max(1, Math.floor((grid.clientWidth + 4) / (window.innerWidth >= 640 ? 48 : 36)));
      // Reserve room for the compact header, legend and optional page controls.
      const rows = Math.max(1, Math.floor((window.innerHeight - 180) / 48));
      setLayout({ columns, capacity: columns * rows });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const page = Math.floor(selected / layout.capacity);
  const start = page * layout.capacity;
  const visible = events.slice(start, start + layout.capacity);
  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(events.length - 1, index));
    setSelected(next);
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-build-event="${next}"]`)?.focus(),
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xs text-muted-foreground">
        <span>Left to right → then next row</span>
        <span>+ Buy / unlock</span>
        <span>↑ Upgrade</span>
        <span>↓ Sell</span>
      </div>
      <ol
        ref={gridRef}
        aria-label={`${playerName}'s chronological build events`}
        className="grid gap-x-1 gap-y-1"
        style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
      >
        {visible.map((event, offset) => {
          const index = start + offset;
          const info = EVENT_INFO[event.kind];
          const Icon = info.icon;
          const label = `${formatMatchDuration(event.time)}: ${info.label} ${eventName(event)}${event.kind === "purchase" && event.item.imbuedInto ? ` · Imbued into ${event.item.imbuedInto.name}` : ""}`;
          return (
            <li key={index} className="relative min-w-0">
              <Separator aria-hidden="true" className="absolute inset-x-0 top-7" />
              <Button
                variant={selected === index ? "secondary" : "ghost"}
                size="icon-sm"
                className="relative h-11 w-full flex-col gap-0.5 px-0 py-0.5"
                aria-label={label}
                title={label}
                aria-pressed={selected === index}
                data-build-event={index}
                tabIndex={selected === index ? 0 : -1}
                onClick={() => setSelected(index)}
                onFocus={() => setSelected(index)}
                onKeyDown={(event) => {
                  if (event.altKey) return;
                  const delta =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : event.key === "ArrowDown"
                          ? layout.columns
                          : event.key === "ArrowUp"
                            ? -layout.columns
                            : null;
                  if (delta != null || event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    goTo(event.key === "Home" ? 0 : event.key === "End" ? events.length - 1 : index + (delta ?? 0));
                  }
                }}
              >
                <span className="text-4xs leading-none tabular-nums">{formatMatchDuration(event.time)}</span>
                <span aria-hidden="true" className="relative">
                  <EventImage event={event} />
                  <CornerBadge corner="bottom-end" className="-inset-e-1 -bottom-0.5 p-px">
                    <Icon className="size-2.5" />
                  </CornerBadge>
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
      {events.length > layout.capacity && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="xs" disabled={page === 0} onClick={() => goTo(start - layout.capacity)}>
            <ChevronLeft data-icon="inline-start" /> Earlier
          </Button>
          <span className="text-3xs text-muted-foreground">
            {start + 1}–{start + visible.length} of {events.length}
          </span>
          <Button
            variant="ghost"
            size="xs"
            disabled={start + layout.capacity >= events.length}
            onClick={() => goTo(start + layout.capacity)}
          >
            Later <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      )}
    </>
  );
}

export function BuildTimelineDialog({ build, playerName }: { build: PlayerBuild; playerName: string }) {
  const events = buildTimeline(build);
  if (events.length === 0) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`View ${playerName}'s build timeline`}
          title="Build timeline"
          onClick={(event) => event.stopPropagation()}
        >
          <ListOrdered aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent size="full" className="flex flex-col gap-2 p-3" onClick={(event) => event.stopPropagation()}>
        <DialogHeader className="pe-6">
          <DialogTitle>Build timeline</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {playerName} · {events.length} events · match time
          </DialogDescription>
        </DialogHeader>
        <BuildTimeline events={events} playerName={playerName} />
      </DialogContent>
    </Dialog>
  );
}
