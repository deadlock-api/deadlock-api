import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Bookmark, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover";
import { day } from "~/dayjs";
import { useSavedMatches } from "~/hooks/useSavedMatches";
import { formatMatchDuration, isWin, matchModeLabel } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

const PAGE_SIZE = 20;

export function SavedMatchesMenu({
  accountId,
  entries,
  onOpenMatch,
}: {
  accountId: number;
  entries: PlayerMatchHistoryEntry[] | undefined;
  onOpenMatch: (matchId: number) => void;
}) {
  const { savedIds, toggleSaved } = useSavedMatches(accountId);
  const byId = useMemo(() => new Map(entries?.map((entry) => [entry.match_id, entry])), [entries]);
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const openingMatch = useRef(false);
  const focusAfterLoad = useRef<number | null>(null);
  useEffect(() => {
    if (visibleCount <= PAGE_SIZE || focusAfterLoad.current == null) return;
    contentRef.current
      ?.querySelector<HTMLButtonElement>(`[data-saved-row="${focusAfterLoad.current}"] button:not(:disabled)`)
      ?.focus();
    focusAfterLoad.current = null;
  }, [visibleCount]);
  const remove = (id: number, index: number) => {
    const next = savedIds[index + 1] ?? savedIds[index - 1];
    if (!toggleSaved(id)) return;
    requestAnimationFrame(() => {
      const target = contentRef.current?.querySelector<HTMLButtonElement>(
        `[data-saved-row="${next}"] button:not(:disabled)`,
      );
      (target ?? contentRef.current)?.focus();
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setVisibleCount(PAGE_SIZE);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="px-1.5 sm:px-2"
          aria-label={`Saved matches (${savedIds.length})`}
          title="Saved matches"
        >
          <Bookmark
            data-icon="inline-start"
            className={cn(savedIds.length > 0 && "text-yellow-400")}
            fill={savedIds.length > 0 ? "currentColor" : "none"}
          />
          <span className="hidden sm:inline">Saved</span>
          {savedIds.length > 0 && <span className="tabular-nums">{savedIds.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        collisionPadding={16}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto p-3"
        onCloseAutoFocus={(event) => {
          if (openingMatch.current) event.preventDefault();
          openingMatch.current = false;
        }}
      >
        <PopoverHeader>
          <PopoverTitle id={titleId}>Saved matches</PopoverTitle>
          <PopoverDescription id={descriptionId}>Saved on this browser, newest saved first.</PopoverDescription>
        </PopoverHeader>
        {savedIds.length === 0 ? (
          <Empty className="gap-2 p-2">
            <EmptyHeader>
              <EmptyTitle>No saved matches yet</EmptyTitle>
              <EmptyDescription>Use the bookmark beside a match ID to save it for later.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border" aria-label="Saved matches for this player">
            {savedIds.slice(0, visibleCount).map((id, index) => {
              const entry = byId.get(id);
              return (
                <li key={id} data-saved-row={id} className="flex min-w-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!entry}
                    className="h-auto min-w-0 flex-1 justify-start px-1 py-1.5"
                    aria-label={`Open saved match ${id}`}
                    aria-describedby={`${titleId}-match-${id}`}
                    title={
                      entry
                        ? `${matchModeLabel(entry)} · ${formatMatchDuration(entry.match_duration_s)} · Match ${id}`
                        : undefined
                    }
                    onClick={() => {
                      openingMatch.current = true;
                      setOpen(false);
                      onOpenMatch(id);
                    }}
                  >
                    {entry && <HeroImage heroId={entry.hero_id} className="size-6 shrink-0 rounded-full" title="" />}
                    <span id={`${titleId}-match-${id}`} className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                      <span className="flex w-full min-w-0 items-center gap-2 text-xs">
                        {entry ? <HeroName heroId={entry.hero_id} /> : <span>Match {id}</span>}
                        {entry && (
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {matchModeLabel(entry)}
                            </span>
                            <span className={cn(isWin(entry) ? "text-victory" : "text-primary")}>
                              {isWin(entry) ? "W" : "L"}
                              <span className="sr-only">{isWin(entry) ? "in" : "oss"}</span>
                            </span>
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {entry
                          ? `${day.unix(entry.start_time).format("MMM D, YYYY HH:mm")} · ${entry.player_kills}/${entry.player_deaths}/${entry.player_assists}`
                          : "Not in loaded history"}
                      </span>
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove saved match ${id}`}
                    title="Remove saved match"
                    onClick={() => remove(id, index)}
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {savedIds.length > visibleCount && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              focusAfterLoad.current = savedIds[visibleCount];
              setVisibleCount((count) => count + PAGE_SIZE);
            }}
          >
            Show {Math.min(PAGE_SIZE, savedIds.length - visibleCount)} more
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
