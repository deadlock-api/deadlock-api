import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Bookmark, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { OptionRow } from "~/components/ui/option-row";
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
import { heroesQueryOptions } from "~/queries/asset-queries";

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
  const { data: heroNames } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name.toLowerCase()])),
  });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filteredIds = useMemo(
    () =>
      query
        ? savedIds.filter((id) => {
            const entry = byId.get(id);
            return String(id).includes(query) || (entry && heroNames?.get(entry.hero_id)?.includes(query));
          })
        : savedIds,
    [savedIds, byId, heroNames, query],
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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
    const next = filteredIds[index + 1] ?? filteredIds[index - 1];
    if (!toggleSaved(id)) return;
    requestAnimationFrame(() => {
      const target = contentRef.current?.querySelector<HTMLButtonElement>(
        `[data-saved-row="${next}"] button:not(:disabled)`,
      );
      (target ?? searchRef.current ?? contentRef.current)?.focus();
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setVisibleCount(PAGE_SIZE);
          setSearch("");
        }
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
            className={cn(savedIds.length > 0 && "text-warning")}
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
        className="flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[var(--radix-popover-content-available-width)] flex-col gap-2 overflow-y-auto p-3"
        onCloseAutoFocus={(event) => {
          if (openingMatch.current) event.preventDefault();
          openingMatch.current = false;
        }}
      >
        <PopoverHeader>
          <PopoverTitle id={titleId}>Saved matches</PopoverTitle>
          <PopoverDescription id={descriptionId}>Saved on this browser, newest saved first.</PopoverDescription>
        </PopoverHeader>
        {savedIds.length > 0 && (
          <Input
            ref={searchRef}
            type="search"
            aria-label="Search saved matches by hero or match ID"
            placeholder="Hero or match ID"
            value={search}
            size="sm"
            className="shrink-0"
            onChange={(event) => {
              setSearch(event.target.value);
              setVisibleCount(PAGE_SIZE);
              focusAfterLoad.current = null;
            }}
          />
        )}
        <output className="sr-only">
          {filteredIds.length} saved {filteredIds.length === 1 ? "match" : "matches"}
          {query && " found"}
        </output>
        {savedIds.length === 0 ? (
          <EmptyState
            variant="inline"
            className="py-2"
            title="No saved matches yet"
            description="Use the bookmark beside a match ID to save it for later."
          />
        ) : filteredIds.length === 0 ? (
          <EmptyState
            variant="inline"
            className="py-2"
            title="No matches found"
            description="Try another hero name or match ID."
          />
        ) : (
          <ul className="flex flex-col gap-0.5" aria-label="Saved matches for this player">
            {filteredIds.slice(0, visibleCount).map((id, index) => {
              const entry = byId.get(id);
              return (
                <li key={id} data-saved-row={id} className="flex min-w-0 items-center gap-1">
                  <OptionRow
                    selected={false}
                    disabled={!entry}
                    className="min-w-0 flex-1"
                    aria-label={`Open saved match ${id}`}
                    aria-describedby={`${titleId}-match-${id} ${titleId}-match-${id}-meta ${titleId}-match-${id}-when`}
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
                    leading={
                      entry && <HeroImage heroId={entry.hero_id} shape="circle" className="size-6 shrink-0" title="" />
                    }
                    description={
                      <span id={`${titleId}-match-${id}-when`} className="text-3xs tabular-nums">
                        {entry
                          ? `${day.unix(entry.start_time).format("MMM D, YYYY HH:mm")} · ${entry.player_kills}/${entry.player_deaths}/${entry.player_assists}`
                          : "Not in loaded history"}
                      </span>
                    }
                    trailing={
                      entry && (
                        <span id={`${titleId}-match-${id}-meta`} className="flex items-center gap-2">
                          <span className="text-3xs font-normal text-muted-foreground">{matchModeLabel(entry)}</span>
                          <Badge variant={isWin(entry) ? "positive" : "negative"} size="sm" shape="square">
                            {isWin(entry) ? "W" : "L"}
                            <span className="sr-only">{isWin(entry) ? "in" : "oss"}</span>
                          </Badge>
                        </span>
                      )
                    }
                  >
                    <span id={`${titleId}-match-${id}`} className="text-xs">
                      {entry ? <HeroName heroId={entry.hero_id} /> : `Match ${id}`}
                    </span>
                  </OptionRow>
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
        {filteredIds.length > visibleCount && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              focusAfterLoad.current = filteredIds[visibleCount];
              setVisibleCount((count) => count + PAGE_SIZE);
            }}
          >
            Show {Math.min(PAGE_SIZE, filteredIds.length - visibleCount)} more
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
