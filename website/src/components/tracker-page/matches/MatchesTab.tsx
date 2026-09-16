import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Home } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useSavedMatches } from "~/hooks/useSavedMatches";
import {
  computeRecords,
  computeSessions,
  MATCH_SORT_KEYS,
  type MatchSortKey,
  type PlaySession,
  recordsByMatchId,
  SORT_DIRS,
  type SortDir,
  sortMatches,
  summarize,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { trackerMatchMetadataQueryOptions } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { MatchDetails } from "./MatchDetails";
import { MatchHistoryList, type MatchHistoryHandle } from "./MatchHistoryList";

// A best among a handful of matches says little, so small sets get no record markers.
const MIN_MATCHES_FOR_RECORDS = 10;
const SORT_LABELS: Record<MatchSortKey, string> = {
  played: "Date",
  kda: "KDA",
  souls: "Souls",
  soulsPerMin: "Souls/min",
  lastHits: "Last hits",
  duration: "Duration",
  rankDelta: "Rank change",
};

export function MatchesTab({
  entries,
  sessionContext,
  ranks,
  accountId,
  heroId,
  onHeroChange,
  hiddenLinkedMatch,
  onRevealLinkedMatch,
  overview,
}: {
  entries: PlayerMatchHistoryEntry[];
  sessionContext: PlayerMatchHistoryEntry[];
  ranks: Rank[];
  accountId: number;
  /** The active hero filter, which an empty list offers to clear. */
  heroId: number | null;
  onHeroChange: (heroId: number | null) => void;
  /** The match the URL opens when the filters leave it out of `entries`. */
  hiddenLinkedMatch: PlayerMatchHistoryEntry | null;
  /** Widens the filters to show `hiddenLinkedMatch`; absent when no filter setting can. */
  onRevealLinkedMatch?: () => void;
  /** Fills the detail pane while no match is picked. */
  overview: ReactNode;
}) {
  const [selectedMatchId, setSelectedMatchId] = useQueryState("match", parseAsInteger);
  const [{ sort: sortKey, dir: sortDir }, setSort] = useQueryStates({
    sort: parseAsStringLiteral(MATCH_SORT_KEYS).withDefault("played"),
    dir: parseAsStringLiteral(SORT_DIRS).withDefault("desc"),
  });
  const sortedEntries = useMemo(() => sortMatches(entries, sortKey, sortDir), [entries, sortKey, sortDir]);
  const { savedIds } = useSavedMatches(accountId);
  const savedMatchIds = useMemo(() => new Set(savedIds), [savedIds]);
  const selectedIndex = sortedEntries.findIndex((entry) => entry.match_id === selectedMatchId);
  // No match in the URL means the pane belongs to the overview, the list's own first entry.
  const selected =
    selectedMatchId === null ? null : selectedIndex === -1 ? hiddenLinkedMatch : sortedEntries[selectedIndex];
  const selectedId = selected?.match_id;

  const listRef = useRef<MatchHistoryHandle>(null);
  const initialSelectedId = useRef(selectedId);
  const previousSort = useRef({ sortKey, sortDir });
  const detailsRef = useRef<HTMLElement>(null);
  const previousSelectedId = useRef(selectedId);

  // The list takes the height of the details beside it, so while a match loads into a short skeleton the details
  // hold their last loaded height; otherwise the list would shrink and grow back with every pick.
  const { isPending: detailsPending } = useQuery({
    ...trackerMatchMetadataQueryOptions(selectedId ?? 0),
    enabled: selectedId != null,
  });
  const isLoadingDetails = selectedId != null && detailsPending;
  const [heldDetailsHeight, setHeldDetailsHeight] = useState<number>();
  useEffect(() => {
    const details = detailsRef.current;
    if (!details || isLoadingDetails) return;
    const observer = new ResizeObserver(([entry]) => setHeldDetailsHeight(entry.borderBoxSize[0].blockSize));
    observer.observe(details);
    return () => observer.disconnect();
  }, [isLoadingDetails]);
  const focusSelectedItem = useRef(false);
  const navigationRef = useRef<HTMLElement>(null);
  const navigationDirection = useRef<-1 | 1 | null>(null);

  // The virtual history can jump to a deep link without mounting all earlier rows.
  useEffect(() => {
    listRef.current?.scrollToMatch(initialSelectedId.current);
  }, []);

  useEffect(() => {
    if (previousSort.current.sortKey !== sortKey || previousSort.current.sortDir !== sortDir) {
      listRef.current?.scrollToTop();
      previousSort.current = { sortKey, sortDir };
    }
  }, [sortKey, sortDir]);

  useEffect(() => {
    const changed = previousSelectedId.current !== selectedId;
    previousSelectedId.current = selectedId;
    if (focusSelectedItem.current) {
      focusSelectedItem.current = false;
      listRef.current?.focusMatch(selectedId);
      return;
    }
    if (!changed && selectedId == null) return;
    // Picking a match while scrolled down into the previous one's details starts the new one from its top.
    const details = detailsRef.current;
    if (changed && navigationDirection.current != null) {
      const direction = navigationDirection.current;
      const button = navigationRef.current?.querySelector<HTMLButtonElement>(`[data-direction="${direction}"]`);
      // Reaching either end disables the activated button; keep keyboard focus on the way back.
      const target = button?.disabled
        ? navigationRef.current?.querySelector<HTMLButtonElement>(`[data-direction="${-direction}"]`)
        : button;
      target?.focus({ preventScroll: true });
    } else if (changed) {
      details?.focus({ preventScroll: true });
    }
    navigationDirection.current = null;
    if (details && details.getBoundingClientRect().top < 0) details.scrollIntoView({ block: "start" });
  }, [selectedId]);

  const selectMatch = (matchId: number) => {
    setSelectedMatchId(matchId);
    // Enter on an already selected row still opens its details after browsing the list with arrow keys.
    if (matchId === selectedId) {
      detailsRef.current?.focus({ preventScroll: true });
      detailsRef.current?.scrollIntoView({ block: "start" });
    }
  };
  const showOverview = () => {
    setSelectedMatchId(null);
    if (selectedId == null) detailsRef.current?.focus({ preventScroll: true });
    detailsRef.current?.scrollIntoView({ block: "start" });
  };
  const navigateMatch = (offset: -1 | 1) => {
    if (selectedIndex < 0) return;
    const next = sortedEntries[selectedIndex + offset];
    if (!next) return;
    navigationDirection.current = offset;
    setSelectedMatchId(next.match_id);
  };

  const handleItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (event.altKey) return;
    event.preventDefault();
    const focusedId = Number(event.currentTarget.dataset.matchId);
    const index = sortedEntries.findIndex((entry) => entry.match_id === focusedId);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sortedEntries.length - 1
          : index + (event.key === "ArrowDown" ? 1 : -1);
    const next = sortedEntries[nextIndex];
    if (!next) return;
    if (next.match_id === selectedId) {
      listRef.current?.focusMatch(selectedId);
      return;
    }
    focusSelectedItem.current = true;
    setSelectedMatchId(next.match_id);
  };

  const changeSort = (next: { sort?: MatchSortKey; dir?: SortDir }) => {
    setSort(next);
  };
  const reverseSortLabel =
    sortKey === "played"
      ? sortDir === "desc"
        ? "Show oldest matches first"
        : "Show newest matches first"
      : sortDir === "desc"
        ? "Sort low to high"
        : "Sort high to low";

  const { data: heroNames } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name])),
  });
  const heroNameOf = (id: number) => heroNames?.get(id) ?? "Unknown";

  // Sessions are contiguous only in play order, so they are hidden under any other sort.
  const sessions = useMemo(
    () => (sortKey === "played" ? computeSessions(entries, sessionContext) : new Map<number, PlaySession>()),
    [entries, sessionContext, sortKey],
  );
  const summary = useMemo(() => summarize(entries), [entries]);
  const heldRecords = useMemo(
    () => (entries.length >= MIN_MATCHES_FOR_RECORDS ? recordsByMatchId(computeRecords(entries)) : null),
    [entries],
  );

  return (
    <div className="@container/matches">
      <div className="grid gap-4 @5xl/matches:grid-cols-[17rem_minmax(0,1fr)] @7xl/matches:grid-cols-[19rem_minmax(0,1fr)]">
        <section
          ref={detailsRef}
          data-match-details={selectedId}
          tabIndex={-1}
          aria-label={selected ? `Match ${selected.match_id} details` : "Overview statistics"}
          className="flex min-w-0 scroll-mt-4 flex-col gap-3 outline-none"
          style={{ minHeight: isLoadingDetails ? heldDetailsHeight : undefined }}
        >
          {hiddenLinkedMatch && selected === hiddenLinkedMatch && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">This match is hidden from the list by the current filters.</span>
              <div className="ml-auto flex gap-2">
                {onRevealLinkedMatch && (
                  <Button size="sm" variant="outline" onClick={onRevealLinkedMatch}>
                    Show it in the list
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={showOverview}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
          {selected === null && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="self-end @5xl/matches:hidden"
                onClick={() => listRef.current?.focusMatch(sortedEntries[0]?.match_id)}
              >
                Match history
                <ArrowDown data-icon="inline-end" />
              </Button>
              {overview}
            </>
          )}
          {selected && (
            <>
              <nav ref={navigationRef} aria-label="Match navigation" className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={showOverview}>
                  <Home data-icon="inline-start" />
                  Back to overview
                </Button>
                {selectedIndex >= 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Previous match in list"
                      data-direction={-1}
                      title="Previous match in current sort order"
                      disabled={selectedIndex === 0}
                      onClick={() => navigateMatch(-1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <output className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      <span className="sr-only">Match </span>
                      {(selectedIndex + 1).toLocaleString("en-US")} of {sortedEntries.length.toLocaleString("en-US")}
                    </output>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Next match in list"
                      data-direction={1}
                      title="Next match in current sort order"
                      disabled={selectedIndex === sortedEntries.length - 1}
                      onClick={() => navigateMatch(1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                )}
              </nav>
              <MatchDetails
                key={selected.match_id}
                entry={selected}
                accountId={accountId}
                ranks={ranks}
                heroName={heroNameOf(selected.hero_id)}
                records={heldRecords?.get(selected.match_id)}
              />
            </>
          )}
        </section>
        {/* Out of flow, so the list takes the height of the details beside it instead of setting it. */}
        <aside
          className={cn(
            "relative h-[26rem] @5xl/matches:order-first @5xl/matches:h-auto @5xl/matches:min-h-[24rem]",
            // Keep match history available while scrolling through the overview.
            selected === null &&
              "@5xl/matches:sticky @5xl/matches:top-4 @5xl/matches:h-[calc(100vh-5rem)] @5xl/matches:min-h-0 @5xl/matches:self-start",
          )}
        >
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-md border border-border">
            <div className="flex items-center border-b border-border">
              <button
                type="button"
                onClick={showOverview}
                aria-current={selected === null ? "true" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                  selected === null ? "bg-accent font-semibold hover:bg-accent focus-visible:bg-accent" : "font-medium",
                )}
              >
                <Home className="size-4 shrink-0 text-muted-foreground" />
                Overview
              </button>
            </div>
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <div className="min-w-0 text-xs leading-tight text-muted-foreground tabular-nums">
                <div className="font-semibold text-foreground">
                  {summary.matches.toLocaleString("en-US")} {summary.matches === 1 ? "match" : "matches"}
                </div>
                {summary.matches > 0 && (
                  <div>
                    <span className={WIN_TEXT_CLASS}>{summary.wins}W</span> –{" "}
                    <span className={LOSS_TEXT_CLASS}>{summary.losses}L</span> · {Math.round(summary.winrate * 100)}%
                  </div>
                )}
              </div>
              <Select
                value={sortKey}
                onValueChange={(value) => changeSort({ sort: value as MatchSortKey, dir: "desc" })}
              >
                <SelectTrigger
                  size="sm"
                  className="ml-auto gap-1 px-2 text-xs data-[size=sm]:h-7"
                  aria-label="Sort matches by"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MATCH_SORT_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {SORT_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => changeSort({ dir: sortDir === "desc" ? "asc" : "desc" })}
                aria-label={reverseSortLabel}
                title={reverseSortLabel}
              >
                {sortDir === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
              </Button>
            </div>
            <MatchHistoryList
              savedMatchIds={savedMatchIds}
              ref={listRef}
              entries={sortedEntries}
              sessions={sessions}
              selectedId={selectedId}
              sortKey={sortKey}
              heroNameOf={heroNameOf}
              hasRecord={(matchId) => heldRecords?.has(matchId) ?? false}
              onSelect={selectMatch}
              onItemKeyDown={handleItemKeyDown}
              heroId={heroId}
              onHeroChange={onHeroChange}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
