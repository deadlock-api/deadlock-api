import { useQueryClient } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { Bookmark, CircleDashed, Gavel, LogOut, Trophy } from "lucide-react";
import { type KeyboardEventHandler, useEffect, useRef } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { RankDelta } from "~/components/features/tracker/shared/RankDelta";
import { useTrackerTime } from "~/components/features/tracker/shared/useTrackerTime";
import { Button } from "~/components/ui/button";
import { TONE_BG, TONE_TEXT } from "~/lib/tone";
import {
  brawlRounds,
  formatMatchDuration,
  isWin,
  matchModeLabel,
  type MatchSortKey,
  sortValueLabel,
  unscoredOutcome,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { trackerMatchMetadataQueryOptions } from "~/queries/tracker-queries";

/**
 * How long the pointer rests on a row before its details are prefetched. Sweeping across the list would
 * otherwise fire a request per row.
 */
const PREFETCH_HOVER_MS = 100;

/** One compact, selectable match in the history column. */
export function MatchListItem({
  entry,
  heroName,
  hasRecord,
  saved = false,
  selected,
  tabIndex,
  showTimeOfDay,
  sortKey,
  onSelect,
  onKeyDown,
}: {
  entry: PlayerMatchHistoryEntry;
  heroName: string;
  /** Whether the match holds a personal best over the filtered history. */
  hasRecord: boolean;
  saved?: boolean;
  selected: boolean;
  /** One tab stop for the list; arrow keys reach the other matches. */
  tabIndex: 0 | -1;
  /** Under a session header the day is already given, so the row only needs the time. */
  showTimeOfDay: boolean;
  /** The list's sort, whose metric takes the mode and duration's place when the row would not otherwise show it. */
  sortKey: MatchSortKey;
  onSelect: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const win = isWin(entry);
  const rounds = brawlRounds(entry);
  const unscored = unscoredOutcome(entry);
  const abandoned = entry.abandoned_time_s != null && entry.abandoned_time_s > 0;
  const { toTime, now } = useTrackerTime();
  const played = toTime(entry.start_time);
  const sortValue = sortValueLabel(entry, sortKey);

  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(prefetchTimer.current), []);
  const schedulePrefetch = () => {
    clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => {
      void queryClient.prefetchQuery(trackerMatchMetadataQueryOptions(entry.match_id));
    }, PREFETCH_HOVER_MS);
  };

  return (
    <Button
      variant="row"
      data-match-id={entry.match_id}
      aria-current={selected ? "true" : undefined}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onMouseEnter={schedulePrefetch}
      onMouseLeave={() => clearTimeout(prefetchTimer.current)}
      className="relative h-auto gap-2.5 py-1 ps-3.5 pe-3"
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 start-0", selected ? "w-1" : "w-0.5", TONE_BG[win ? "positive" : "negative"])}
      />
      <span aria-hidden="true" className="shrink-0">
        <HeroImage heroId={entry.hero_id} shape="circle" className="size-7" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm", selected ? "font-semibold" : "font-medium")}>{heroName}</span>
          {saved && <Bookmark className="size-3 shrink-0 text-warning" fill="currentColor" aria-label="Saved match" />}
          {hasRecord && <Trophy className="size-3 shrink-0 text-warning" aria-label="Personal best" />}
          {abandoned && <LogOut className="size-3 shrink-0 text-muted-foreground" aria-label="Abandoned" />}
          {unscored && (
            <span aria-label="Not scored" className="contents">
              {unscored === "not_scored" ? (
                <CircleDashed className="size-3 shrink-0 text-muted-foreground" />
              ) : (
                <Gavel className="size-3 shrink-0 text-muted-foreground" />
              )}
            </span>
          )}
          <span className="ms-auto shrink-0 ps-2 text-sm tabular-nums">
            {entry.player_kills} / {entry.player_deaths} / {entry.player_assists}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <span className={cn("font-semibold", TONE_TEXT[win ? "positive" : "negative"])}>
            {win ? "W" : "L"}
            {rounds && ` ${rounds.own}–${rounds.enemy}`}
          </span>
          <span
            className="truncate"
            title={`${matchModeLabel(entry)} · ${formatMatchDuration(entry.match_duration_s)}`}
          >
            · {sortValue ?? `${matchModeLabel(entry)} · ${formatMatchDuration(entry.match_duration_s)}`}
          </span>
          <span className="ms-auto flex shrink-0 items-center gap-1.5 ps-2">
            <RankDelta value={entry.ranked_delta} />
            <span title={played.format("MMM D, YYYY HH:mm")}>
              {showTimeOfDay
                ? played.format("HH:mm")
                : played.format(now && played.isSame(now, "year") ? "MMM D" : "MMM D, YYYY")}
            </span>
          </span>
        </div>
      </div>
    </Button>
  );
}
