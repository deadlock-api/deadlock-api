import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import {
  type KeyboardEventHandler,
  type Ref,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "~/components/ui/button";
import { day } from "~/dayjs";
import { formatPlaytime, type MatchSortKey, type PlaySession } from "~/lib/tracker/compute";
import { buildHistoryRows, historyStickyIndex } from "~/lib/tracker/history";
import { cn } from "~/lib/utils";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { RankDelta } from "../shared/RankDelta";
import { MatchListItem } from "./MatchListItem";

function sessionDateLabel(unix: number): string {
  const date = day.unix(unix);
  const today = day().startOf("day");
  if (date.isSame(today, "day")) return "Today";
  if (date.isSame(today.subtract(1, "day"), "day")) return "Yesterday";
  return date.format(date.isSame(today, "year") ? "ddd, MMM D" : "ddd, MMM D, YYYY");
}

function SessionHeader({ session }: { session: PlaySession }) {
  return (
    <div className="flex items-center gap-2 border-y border-border bg-muted px-3 py-1 text-xs">
      <span className="font-semibold">{sessionDateLabel(session.startUnix)}</span>
      <span className="tabular-nums">
        <span className={cn("font-semibold", WIN_TEXT_CLASS)}>{session.wins}W</span>
        <span className="text-muted-foreground"> – </span>
        <span className={cn("font-semibold", LOSS_TEXT_CLASS)}>{session.losses}L</span>
      </span>
      <RankDelta
        value={session.rankDelta}
        className="font-semibold"
        title="Net rank change in selected session matches"
      />
      <span
        className="ml-auto text-muted-foreground tabular-nums"
        title={`${day.unix(session.startUnix).format("HH:mm")} – ${day.unix(session.endUnix).format("HH:mm")}`}
      >
        {formatPlaytime(session.totalTimeS)}
      </span>
    </div>
  );
}

export interface MatchHistoryHandle {
  focusMatch: (matchId: number | undefined) => void;
  scrollToMatch: (matchId: number | undefined, align?: "auto" | "center") => void;
  scrollToTop: () => void;
}

/** Keep deep links and old-match navigation independent of the number of loaded matches. */
export function MatchHistoryList({
  ref,
  entries,
  sessions,
  selectedId,
  sortKey,
  heroNameOf,
  hasRecord,
  savedMatchIds,
  onSelect,
  onItemKeyDown,
  heroId,
  onHeroChange,
}: {
  ref?: Ref<MatchHistoryHandle>;
  entries: PlayerMatchHistoryEntry[];
  sessions: Map<number, PlaySession>;
  selectedId: number | undefined;
  sortKey: MatchSortKey;
  heroNameOf: (heroId: number) => string;
  hasRecord: (matchId: number) => boolean;
  savedMatchIds: ReadonlySet<number>;
  onSelect: (matchId: number) => void;
  onItemKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  heroId: number | null;
  onHeroChange: (heroId: number | null) => void;
}) {
  "use no memo";
  // The virtualizer is mutable; its measurements must be read on every scroll render.
  const listRef = useRef<HTMLElement>(null);
  const keyboardHelpId = useId();
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const { rows, matchRowIndexes, stickyIndexes } = useMemo(
    () => buildHistoryRows(entries, sessions),
    [entries, sessions],
  );
  const selectedRow = selectedId == null ? undefined : matchRowIndexes.get(selectedId);
  const focusedRow = focusedId == null ? undefined : matchRowIndexes.get(focusedId);
  const firstRow = matchRowIndexes.get(entries[0]?.match_id);
  const activeStickyIndex = useRef<number | undefined>(undefined);
  // oxlint-disable-next-line react/incompatible-library, react-hooks-js/incompatible-library -- This component explicitly opts out of React Compiler memoization for the mutable virtualizer.
  const virtualizer = useVirtualizer<HTMLElement, HTMLLIElement>({
    count: rows.length,
    getScrollElement: useCallback(() => listRef.current, []),
    estimateSize: useCallback((index) => (rows[index].kind === "session" ? 28 : 44), [rows]),
    getItemKey: useCallback((index) => rows[index].key, [rows]),
    overscan: 12,
    // Detail-pane changes resize this list; measure on the next frame instead of during observer delivery.
    useAnimationFrameWithResizeObserver: true,
    initialRect: { width: 0, height: 400 },
    scrollPaddingStart: 28,
    rangeExtractor: useCallback(
      (range) => {
        const sticky = historyStickyIndex(stickyIndexes, range.startIndex);
        activeStickyIndex.current = sticky;
        const indexes = new Set(defaultRangeExtractor(range));
        // Retain the single tab stop and a focused row even when either is scrolled out of view.
        for (const index of [sticky, selectedRow ?? firstRow, focusedRow]) {
          if (index != null) indexes.add(index);
        }
        return [...indexes].sort((a, b) => a - b);
      },
      [stickyIndexes, selectedRow, firstRow, focusedRow],
    ),
  });
  useImperativeHandle(ref, () => ({
    focusMatch(matchId) {
      if (matchId == null) return;
      const index = matchRowIndexes.get(matchId);
      if (index == null) return;
      virtualizer.scrollToIndex(index, { align: "auto" });
      const item = listRef.current?.querySelector<HTMLButtonElement>(`[data-match-id="${matchId}"]`);
      item?.focus({ preventScroll: true });
      item?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    scrollToMatch(matchId, align = "center") {
      const index = matchId == null ? undefined : matchRowIndexes.get(matchId);
      if (index != null) virtualizer.scrollToIndex(index, { align });
    },
    scrollToTop() {
      virtualizer.scrollToOffset(0);
    },
  }));

  return (
    <nav
      ref={listRef}
      className="relative min-h-0 flex-1 scroll-pt-7 scrollbar-thin overflow-y-auto overscroll-contain"
      aria-label="Match history"
      aria-describedby={keyboardHelpId}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLButtonElement && event.target.dataset.matchId)
          setFocusedId(Number(event.target.dataset.matchId));
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedId(null);
      }}
    >
      <p id={keyboardHelpId} className="sr-only">
        Use the up and down arrow keys to browse matches, or Home and End for the first and last match. Press Enter to
        view the selected match's details.
      </p>
      <ol className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          const sticky = row.kind === "session" && item.index === activeStickyIndex.current;
          return (
            <li
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              aria-posinset={item.index + 1}
              aria-setsize={rows.length}
              className={cn("top-0 left-0 w-full", sticky ? "sticky z-10" : "absolute")}
              style={sticky ? undefined : { transform: `translateY(${item.start}px)` }}
            >
              {row.kind === "session" ? (
                <SessionHeader session={row.session} />
              ) : (
                <MatchListItem
                  entry={row.entry}
                  heroName={heroNameOf(row.entry.hero_id)}
                  hasRecord={hasRecord(row.entry.match_id)}
                  saved={savedMatchIds.has(row.entry.match_id)}
                  selected={row.entry.match_id === selectedId}
                  tabIndex={row.entry.match_id === selectedId || (selectedRow == null && row.matchIndex === 0) ? 0 : -1}
                  showTimeOfDay={sessions.has(row.entry.match_id)}
                  sortKey={sortKey}
                  onSelect={() => onSelect(row.entry.match_id)}
                  onKeyDown={onItemKeyDown}
                />
              )}
            </li>
          );
        })}
      </ol>
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
    </nav>
  );
}
