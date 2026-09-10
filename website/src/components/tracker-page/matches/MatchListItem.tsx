import { useQueryClient } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { CircleDashed, Gavel, LogOut, Trophy } from "lucide-react";
import { type KeyboardEventHandler, useRef } from "react";

import { HeroImage } from "~/components/HeroImage";
import { day } from "~/dayjs";
import { brawlRounds, formatMatchDuration, isWin, matchModeLabel, unscoredOutcome } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { trackerMatchDeathsQueryOptions, trackerMatchMetadataQueryOptions } from "~/queries/tracker-queries";

import { LOSS_DOT_CLASS, LOSS_TEXT_CLASS, WIN_DOT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { RankDelta } from "../shared/RankDelta";

/**
 * How long the pointer rests on a row before its details are prefetched. Sweeping across the list would
 * otherwise fire a request per row, and a rate-limited one caches the match as having no details.
 */
const PREFETCH_HOVER_MS = 100;

/** One compact, selectable match in the history column. */
export function MatchListItem({
  entry,
  heroName,
  hasRecord,
  selected,
  showTimeOfDay,
  onSelect,
  onKeyDown,
}: {
  entry: PlayerMatchHistoryEntry;
  heroName: string;
  /** Whether the match holds a personal best over the filtered history. */
  hasRecord: boolean;
  selected: boolean;
  /** Under a session header the day is already given, so the row only needs the time. */
  showTimeOfDay: boolean;
  onSelect: () => void;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
}) {
  const win = isWin(entry);
  const rounds = brawlRounds(entry);
  const unscored = unscoredOutcome(entry);
  const abandoned = entry.abandoned_time_s != null && entry.abandoned_time_s > 0;
  const played = day.unix(entry.start_time);

  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const schedulePrefetch = () => {
    prefetchTimer.current = setTimeout(() => {
      void queryClient.prefetchQuery(trackerMatchMetadataQueryOptions(entry.match_id));
      void queryClient.prefetchQuery(trackerMatchDeathsQueryOptions(entry.match_id));
    }, PREFETCH_HOVER_MS);
  };

  return (
    <button
      type="button"
      data-match-id={entry.match_id}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onMouseEnter={schedulePrefetch}
      onMouseLeave={() => clearTimeout(prefetchTimer.current)}
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2.5 py-1 pr-3 pl-3.5 text-left transition-colors",
        "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
        selected && "bg-accent hover:bg-accent focus-visible:bg-accent",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0", selected ? "w-1" : "w-0.5", win ? WIN_DOT_CLASS : LOSS_DOT_CLASS)}
      />
      <HeroImage heroId={entry.hero_id} className="size-7 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-sm", selected ? "font-semibold" : "font-medium")}>{heroName}</span>
          {hasRecord && <Trophy className="size-3 shrink-0 text-amber-500" aria-label="Personal best" />}
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
          <span className="ml-auto shrink-0 pl-2 text-sm tabular-nums">
            {entry.player_kills} / {entry.player_deaths} / {entry.player_assists}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <span className={cn("font-semibold", win ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>
            {win ? "W" : "L"}
            {rounds && ` ${rounds.own}–${rounds.enemy}`}
          </span>
          <span className="truncate">
            · {matchModeLabel(entry)} · {formatMatchDuration(entry.match_duration_s)}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
            <RankDelta value={entry.ranked_delta} />
            <span title={played.format("MMM D, YYYY HH:mm")}>
              {showTimeOfDay
                ? played.format("HH:mm")
                : played.format(played.isSame(day(), "year") ? "MMM D" : "MMM D, YYYY")}
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}
