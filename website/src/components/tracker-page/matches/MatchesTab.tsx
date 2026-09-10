import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { Fragment, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { day } from "~/dayjs";
import {
  computeRecords,
  computeSessions,
  formatPlaytime,
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
import { RankDelta } from "../shared/RankDelta";
import { MatchDetails } from "./MatchDetails";
import { MatchListItem } from "./MatchListItem";

// A best among a handful of matches says little, so small sets get no record markers.
const MIN_MATCHES_FOR_RECORDS = 10;
const LIST_CHUNK = 50;
/** How far past the list's visible end the next chunk renders, so scrolling never catches up with it. */
const PRELOAD_MARGIN_PX = 2400;
/** Height of a sticky session header, which covers the top of the list viewport. */
const SESSION_HEADER_PX = 26;

const SORT_LABELS: Record<MatchSortKey, string> = {
  played: "Date",
  kda: "KDA",
  souls: "Souls",
  soulsPerMin: "Souls/min",
  lastHits: "Last hits",
  duration: "Duration",
  rankDelta: "Rank change",
};

function sessionDateLabel(unix: number): string {
  const date = day.unix(unix);
  const today = day().startOf("day");
  if (date.isSame(today, "day")) return "Today";
  if (date.isSame(today.subtract(1, "day"), "day")) return "Yesterday";
  return date.format(date.isSame(today, "year") ? "ddd, MMM D" : "ddd, MMM D, YYYY");
}

function SessionHeader({ session }: { session: PlaySession }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border bg-muted px-3 py-1 text-xs first:border-t-0">
      <span className="font-semibold">{sessionDateLabel(session.startUnix)}</span>
      <span className="tabular-nums">
        <span className={cn("font-semibold", WIN_TEXT_CLASS)}>{session.wins}W</span>
        <span className="text-muted-foreground"> – </span>
        <span className={cn("font-semibold", LOSS_TEXT_CLASS)}>{session.losses}L</span>
      </span>
      <RankDelta value={session.rankDelta} className="font-semibold" title="Net rank change over the session" />
      <span
        className="ml-auto text-muted-foreground tabular-nums"
        title={`${day.unix(session.startUnix).format("HH:mm")} – ${day.unix(session.endUnix).format("HH:mm")}`}
      >
        {session.matches} · {formatPlaytime(session.totalTimeS)}
      </span>
    </div>
  );
}

export function MatchesTab({
  entries,
  ranks,
  accountId,
  heroId,
  onHeroChange,
  hiddenLinkedMatch,
  onRevealLinkedMatch,
}: {
  entries: PlayerMatchHistoryEntry[];
  ranks: Rank[];
  accountId: number;
  /** The active hero filter, which an empty list offers to clear. */
  heroId: number | null;
  onHeroChange: (heroId: number | null) => void;
  /** The match the URL opens when the filters leave it out of `entries`. */
  hiddenLinkedMatch: PlayerMatchHistoryEntry | null;
  /** Widens the filters to show `hiddenLinkedMatch`; absent when no filter setting can. */
  onRevealLinkedMatch?: () => void;
}) {
  const [selectedMatchId, setSelectedMatchId] = useQueryState("match", parseAsInteger);
  const [{ sort: sortKey, dir: sortDir }, setSort] = useQueryStates({
    sort: parseAsStringLiteral(MATCH_SORT_KEYS).withDefault("played"),
    dir: parseAsStringLiteral(SORT_DIRS).withDefault("desc"),
  });
  const sortedEntries = useMemo(() => sortMatches(entries, sortKey, sortDir), [entries, sortKey, sortDir]);
  const selectedIndex = sortedEntries.findIndex((entry) => entry.match_id === selectedMatchId);
  // `entries` arrive newest first, so without a selection in the list the latest match shows.
  const selected = selectedIndex === -1 ? (hiddenLinkedMatch ?? entries[0]) : sortedEntries[selectedIndex];
  const selectedId = selected?.match_id;

  const [visibleCount, setVisibleCount] = useState(() => Math.max(LIST_CHUNK, selectedIndex + LIST_CHUNK));
  const visibleEntries = useMemo(() => sortedEntries.slice(0, visibleCount), [sortedEntries, visibleCount]);
  const hasMore = visibleCount < sortedEntries.length;

  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // The list takes the height of the details beside it, so while a match loads into a short skeleton the details
  // hold their last loaded height; otherwise the list would shrink and grow back with every pick.
  const { isPending: detailsPending } = useQuery({
    ...trackerMatchMetadataQueryOptions(selectedId ?? 0),
    enabled: selectedId != null,
  });
  const [heldDetailsHeight, setHeldDetailsHeight] = useState<number>();
  useEffect(() => {
    const details = detailsRef.current;
    if (!details || detailsPending) return;
    const observer = new ResizeObserver(([entry]) => setHeldDetailsHeight(entry.borderBoxSize[0].blockSize));
    observer.observe(details);
    return () => observer.disconnect();
  }, [detailsPending]);
  const focusSelectedItem = useRef(false);

  // The observer is rebuilt after every chunk, and a new observer reports at once, so chunks keep coming
  // until the list's end lies further past its visible end than the preload margin.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((count) => count + LIST_CHUNK);
      },
      { root: listRef.current, rootMargin: `0px 0px ${PRELOAD_MARGIN_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  // A shared link opens with its match centered in the list; `scrollIntoView` would scroll the page too.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>("[aria-current]");
    if (list && item) list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2;
  }, []);

  useEffect(() => {
    if (!focusSelectedItem.current) return;
    focusSelectedItem.current = false;
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-match-id="${selectedId}"]`);
    if (!list || !item) return;
    item.focus({ preventScroll: true });
    const top = item.offsetTop - SESSION_HEADER_PX;
    const bottom = item.offsetTop + item.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [selectedId]);

  const selectMatch = (matchId: number) => {
    setSelectedMatchId(matchId);
    // Picking a match while scrolled down into the previous one's details starts the new one from its top.
    const details = detailsRef.current;
    if (details && details.getBoundingClientRect().top < 0) details.scrollIntoView({ block: "start" });
  };

  const handleItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const index = sortedEntries.findIndex((entry) => entry.match_id === selectedId);
    const nextIndex = index + (event.key === "ArrowDown" ? 1 : -1);
    const next = sortedEntries[nextIndex];
    if (!next) return;
    event.preventDefault();
    if (nextIndex >= visibleCount) setVisibleCount((count) => count + LIST_CHUNK);
    focusSelectedItem.current = true;
    setSelectedMatchId(next.match_id);
  };

  const changeSort = (next: { sort?: MatchSortKey; dir?: SortDir }) => {
    setSort(next);
    setVisibleCount(LIST_CHUNK);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const { data: heroNames } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name])),
  });
  const heroNameOf = (id: number) => heroNames?.get(id) ?? "Unknown";

  // Sessions are contiguous only in play order, so they are hidden under any other sort.
  const sessions = useMemo(
    () => (sortKey === "played" ? computeSessions(entries) : new Map<number, PlaySession>()),
    [entries, sortKey],
  );
  const summary = useMemo(() => summarize(entries), [entries]);
  const heldRecords = useMemo(
    () => (entries.length >= MIN_MATCHES_FOR_RECORDS ? recordsByMatchId(computeRecords(entries)) : null),
    [entries],
  );

  return (
    <div className="@container/matches">
      <div className="grid gap-4 @3xl/matches:grid-cols-[19rem_minmax(0,1fr)] @5xl/matches:grid-cols-[21rem_minmax(0,1fr)]">
        {/* Out of flow, so the list takes the height of the details beside it instead of setting it. */}
        <aside className="relative h-[26rem] @3xl/matches:h-auto @3xl/matches:min-h-[24rem]">
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-md border border-border">
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
                <SelectTrigger size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" aria-label="Sort matches by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_SORT_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {SORT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => changeSort({ dir: sortDir === "desc" ? "asc" : "desc" })}
                aria-label={sortDir === "desc" ? "Sorted high to low" : "Sorted low to high"}
                title={sortDir === "desc" ? "Sorted high to low" : "Sorted low to high"}
              >
                {sortDir === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
              </Button>
            </div>
            <div
              ref={listRef}
              className="relative min-h-0 flex-1 scrollbar-thin overflow-y-auto overscroll-contain"
              aria-label="Match history"
            >
              {visibleEntries.map((entry, index) => {
                const session = sessions.get(entry.match_id);
                const startsSession =
                  session != null && (index === 0 || sessions.get(visibleEntries[index - 1].match_id) !== session);
                return (
                  <Fragment key={entry.match_id}>
                    {startsSession && <SessionHeader session={session} />}
                    <MatchListItem
                      entry={entry}
                      heroName={heroNameOf(entry.hero_id)}
                      hasRecord={heldRecords?.has(entry.match_id) ?? false}
                      selected={entry.match_id === selectedId}
                      showTimeOfDay={session != null}
                      onSelect={() => selectMatch(entry.match_id)}
                      onKeyDown={handleItemKeyDown}
                    />
                  </Fragment>
                );
              })}
              {entries.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No matches found
                  {heroId != null && (
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => onHeroChange(null)}>
                        Show all heroes
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
            </div>
          </div>
        </aside>
        <div
          ref={detailsRef}
          className="min-w-0 scroll-mt-4 space-y-4"
          style={{ minHeight: detailsPending ? heldDetailsHeight : undefined }}
        >
          {hiddenLinkedMatch && selected === hiddenLinkedMatch && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">This match is hidden from the list by the current filters.</span>
              <div className="ml-auto flex gap-2">
                {onRevealLinkedMatch && (
                  <Button size="sm" onClick={onRevealLinkedMatch}>
                    Show it in the list
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedMatchId(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
          {selected && (
            <MatchDetails
              key={selected.match_id}
              entry={selected}
              accountId={accountId}
              ranks={ranks}
              heroName={heroNameOf(selected.hero_id)}
              records={heldRecords?.get(selected.match_id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
