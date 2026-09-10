import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ChevronDown, CircleDashed, Gavel, LogOut, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import type { Ref } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { CopyButton } from "~/components/copy-button";
import { HeroImage } from "~/components/HeroImage";
import { TableCell, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import {
  brawlRounds,
  formatMatchDuration,
  type HeldRecord,
  isWin,
  kdaRatio,
  MATCH_MODE_LABELS_BY_ID,
  soulsPerMinute,
  type TrackerSummary,
  type UnscoredOutcome,
  unscoredOutcome,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";

import { LOSS_DOT_CLASS, LOSS_TEXT_CLASS, WIN_DOT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { RankDelta } from "../shared/RankDelta";

const UNSCORED_OUTCOME_MARKERS: Record<UnscoredOutcome, { icon: typeof Gavel; label: string; description: string }> = {
  penalized: { icon: Gavel, label: "Penalized", description: "Penalized for this match" },
  party_penalized: { icon: Gavel, label: "Party penalized", description: "Penalized with the party for this match" },
  not_scored: { icon: CircleDashed, label: "Not scored", description: "This match did not count" },
};

/**
 * Container breakpoints at which the match table's optional columns appear, shared by the header, rows, and
 * footer. Each column should only step in once the table has room for it, or the table scrolls sideways.
 */
export const COLUMN_VISIBILITY = {
  souls: "hidden @md:table-cell",
  expand: "hidden @md:table-cell",
  soulsPerMin: "hidden @2xl:table-cell",
  duration: "hidden @3xl:table-cell",
  mode: "hidden @4xl:table-cell",
  lastHits: "hidden @5xl:table-cell",
  matchId: "hidden @6xl:table-cell",
  teamBuilder: "hidden @6xl:table-cell",
} as const;

/** A thin bar along the left edge of a `relative` cell, colored by the match result. */
export function ResultEdge({ win }: { win: boolean }) {
  return <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.5", win ? WIN_DOT_CLASS : LOSS_DOT_CLASS)} />;
}

function UnscoredOutcomeMarker({ outcome }: { outcome: UnscoredOutcome }) {
  const { icon: Icon, label, description } = UNSCORED_OUTCOME_MARKERS[outcome];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Icon className="size-3.5 text-muted-foreground" aria-label={label} />
      </TooltipTrigger>
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  );
}

export function MatchRow({
  ref,
  entry,
  ranks,
  heroName,
  records,
  heroSummary,
  heroFiltered,
  onToggleHeroFilter,
  expanded,
  onToggle,
}: {
  ref?: Ref<HTMLTableRowElement>;
  entry: PlayerMatchHistoryEntry;
  ranks: Rank[];
  heroName: string;
  /** Personal bests this match holds over the filtered history. */
  records?: HeldRecord[];
  /** The player's record on this hero over the filtered history. */
  heroSummary: TrackerSummary;
  /** Whether the history is already narrowed to a hero. */
  heroFiltered: boolean;
  onToggleHeroFilter: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const win = isWin(entry);
  const unscored = unscoredOutcome(entry);
  const rounds = brawlRounds(entry);
  return (
    <TableRow
      ref={ref}
      tabIndex={0}
      aria-expanded={expanded}
      className={cn(
        "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none",
        // Joins the row with its details panel below, which shares the tint.
        expanded && "border-b-0 bg-muted/30",
      )}
      onClick={onToggle}
      onKeyDown={(event) => {
        // Buttons and links inside the row handle their own keys.
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
    >
      <TableCell className="relative">
        <ResultEdge win={win} />
        <div className="flex items-center gap-1">
          <span className={cn("font-bold", win ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>{win ? "W" : "L"}</span>
          {rounds && (
            <span className="text-xs text-muted-foreground tabular-nums" title="Rounds won – lost">
              {rounds.own}–{rounds.enemy}
            </span>
          )}
          {entry.abandoned_time_s != null && entry.abandoned_time_s > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <LogOut className="size-3.5 text-muted-foreground" aria-label="Abandoned" />
              </TooltipTrigger>
              <TooltipContent>Abandoned at {formatMatchDuration(entry.abandoned_time_s)}</TooltipContent>
            </Tooltip>
          )}
          {unscored && <UnscoredOutcomeMarker outcome={unscored} />}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleHeroFilter();
                }}
                className="shrink-0 cursor-pointer rounded-full transition-shadow hover:ring-2 hover:ring-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <HeroImage heroId={entry.hero_id} className="size-7 rounded-full" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {heroFiltered ? (
                "Show all heroes"
              ) : (
                <>
                  Show only {heroName} matches
                  <div className="text-muted-foreground tabular-nums">
                    {heroSummary.wins}W – {heroSummary.losses}L · {Math.round(heroSummary.winrate * 100)}%
                  </div>
                </>
              )}
            </TooltipContent>
          </Tooltip>
          <span className="hidden max-w-[120px] truncate @xl:inline">{heroName}</span>
          {records && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Trophy className="size-3.5 shrink-0 text-amber-500" aria-label="Personal best" />
              </TooltipTrigger>
              <TooltipContent>
                {records.map((record) => (
                  <div key={record.label}>
                    {record.label}: {record.value}
                  </div>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className={cn("text-muted-foreground", COLUMN_VISIBILITY.mode)}>
        {MATCH_MODE_LABELS_BY_ID[entry.match_mode] ?? "Unknown"}
      </TableCell>
      <TableCell className="text-right tabular-nums" title={`KDA ${kdaRatio(entry).toFixed(2)}`}>
        {entry.player_kills} / {entry.player_deaths} / {entry.player_assists}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", COLUMN_VISIBILITY.souls)}>
        {entry.net_worth.toLocaleString("en-US")}
      </TableCell>
      <TableCell className={cn("text-right text-muted-foreground tabular-nums", COLUMN_VISIBILITY.soulsPerMin)}>
        {Math.round(soulsPerMinute(entry)).toLocaleString("en-US")}
      </TableCell>
      <TableCell className={cn("text-right text-muted-foreground tabular-nums", COLUMN_VISIBILITY.lastHits)}>
        {entry.last_hits} / {entry.denies}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", COLUMN_VISIBILITY.duration)}>
        {formatMatchDuration(entry.match_duration_s)}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5 [&_picture]:shrink-0">
          {entry.ranked_display_badge != null && entry.ranked_display_badge > 0 && (
            <span className="hidden @sm:contents">
              <BadgeImage badge={entry.ranked_display_badge} ranks={ranks} className="size-6 max-w-none" />
            </span>
          )}
          <RankDelta value={entry.ranked_delta} className="text-xs" />
          {entry.ranked_used_demotion_protection && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldCheck className="size-3.5 text-muted-foreground" aria-label="Demotion protection" />
              </TooltipTrigger>
              <TooltipContent>Demotion protection prevented a rank drop</TooltipContent>
            </Tooltip>
          )}
          {entry.ranked_calibration_match != null && entry.ranked_calibration_match !== 0 && (
            <span className="text-xs text-muted-foreground" title="Calibration match">
              C
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <span className="@3xl:hidden">{day.unix(entry.start_time).format("MMM D")}</span>
              <span className="hidden @3xl:inline">{day.unix(entry.start_time).fromNow()}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{day.unix(entry.start_time).format("MMM D, YYYY HH:mm")}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className={COLUMN_VISIBILITY.matchId}>
        <div className="flex items-center justify-end gap-0.5 text-muted-foreground tabular-nums">
          {entry.match_id}
          <CopyButton text={String(entry.match_id)} iconOnly title="Copy match ID" className="size-6" />
        </div>
      </TableCell>
      <TableCell className={COLUMN_VISIBILITY.teamBuilder}>
        <Link
          to="/team-builder"
          search={{ match: entry.match_id }}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title="Analyze this draft in the Team Builder"
        >
          <UsersRound className="size-4" />
        </Link>
      </TableCell>
      <TableCell className={COLUMN_VISIBILITY.expand}>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </TableCell>
    </TableRow>
  );
}
