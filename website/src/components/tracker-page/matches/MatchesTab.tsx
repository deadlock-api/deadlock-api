import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ChevronDown, UsersRound } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { CopyButton } from "~/components/copy-button";
import { HeroImage } from "~/components/HeroImage";
import { PaginationControls } from "~/components/PaginationControls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import {
  computeSessions,
  formatMatchDuration,
  isWin,
  MATCH_MODE_LABELS_BY_ID,
  type PlaySession,
} from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { MatchRowDetails } from "./MatchRowDetails";

function sessionDateLabel(unix: number): string {
  const date = day.unix(unix);
  const today = day().startOf("day");
  if (date.isSame(today, "day")) return "Today";
  if (date.isSame(today.subtract(1, "day"), "day")) return "Yesterday";
  return date.format(date.isSame(today, "year") ? "ddd, MMM D" : "ddd, MMM D, YYYY");
}

function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function SessionRow({ session }: { session: PlaySession }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={12} className="bg-muted/40 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="font-semibold">{sessionDateLabel(session.startUnix)}</span>
          <span className="text-muted-foreground tabular-nums">
            {day.unix(session.startUnix).format("HH:mm")} – {day.unix(session.endUnix).format("HH:mm")}
          </span>
          <span className="tabular-nums">
            <span className={cn("font-semibold", WIN_TEXT_CLASS)}>{session.wins}W</span>
            <span className="text-muted-foreground"> – </span>
            <span className={cn("font-semibold", LOSS_TEXT_CLASS)}>{session.losses}L</span>
          </span>
          {session.rankDelta != null && session.rankDelta !== 0 && (
            <span
              className={cn("font-semibold tabular-nums", session.rankDelta > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}
              title="Net rank change over the session"
            >
              {session.rankDelta > 0 ? `+${session.rankDelta}` : session.rankDelta}
            </span>
          )}
          <span className="ml-auto text-muted-foreground tabular-nums">
            {session.matches} {session.matches === 1 ? "match" : "matches"} · {formatPlaytime(session.totalTimeS)}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function MatchesTab({
  entries,
  ranks,
  accountId,
}: {
  entries: PlayerMatchHistoryEntry[];
  ranks: Rank[];
  accountId: number;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null);

  const { data: heroNames } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name])),
  });

  const sessions = useMemo(() => computeSessions(entries), [entries]);
  const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
  const paginatedEntries = useMemo(
    () => entries.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage),
    [entries, currentPage, itemsPerPage],
  );

  return (
    <div className="@container space-y-3">
      <PaginationControls
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={setItemsPerPage}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        totalPages={totalPages}
      />
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="w-14">
              <span className="@md:hidden">W/L</span>
              <span className="hidden @md:inline">Result</span>
            </TableHead>
            <TableHead>Hero</TableHead>
            <TableHead className="hidden @3xl:table-cell">Mode</TableHead>
            <TableHead className="text-right">K / D / A</TableHead>
            <TableHead className="hidden text-right @md:table-cell">Souls</TableHead>
            <TableHead className="hidden text-right @4xl:table-cell" title="Last hits / Denies">
              LH / DN
            </TableHead>
            <TableHead className="hidden text-right @3xl:table-cell">Duration</TableHead>
            <TableHead className="text-right">Rank</TableHead>
            <TableHead className="text-right">Played</TableHead>
            <TableHead className="hidden text-right @4xl:table-cell">Match ID</TableHead>
            <TableHead className="hidden w-8 @4xl:table-cell" />
            <TableHead className="hidden w-8 @md:table-cell" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry, index) => {
            const win = isWin(entry);
            const expanded = expandedMatchId === entry.match_id;
            const session = sessions.get(entry.match_id);
            const startsSession =
              session != null && (index === 0 || sessions.get(paginatedEntries[index - 1].match_id) !== session);
            return (
              <Fragment key={entry.match_id}>
                {startsSession && <SessionRow session={session} />}
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setExpandedMatchId(expanded ? null : entry.match_id)}
                >
                  <TableCell>
                    <span className={cn("font-bold", win ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>{win ? "W" : "L"}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <HeroImage heroId={entry.hero_id} className="size-7 rounded-full" />
                      <span className="hidden max-w-[120px] truncate @xl:inline">
                        {heroNames?.get(entry.hero_id) ?? "Unknown"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground @3xl:table-cell">
                    {MATCH_MODE_LABELS_BY_ID[entry.match_mode] ?? "Unknown"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.player_kills} / {entry.player_deaths} / {entry.player_assists}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums @md:table-cell">
                    {entry.net_worth.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums @4xl:table-cell">
                    {entry.last_hits} / {entry.denies}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums @3xl:table-cell">
                    {formatMatchDuration(entry.match_duration_s)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5 [&_picture]:shrink-0">
                      {entry.ranked_display_badge != null && entry.ranked_display_badge > 0 && (
                        <BadgeImage badge={entry.ranked_display_badge} ranks={ranks} className="size-6 max-w-none" />
                      )}
                      {entry.ranked_delta != null && entry.ranked_delta !== 0 && (
                        <span
                          className={cn(
                            "text-xs tabular-nums",
                            entry.ranked_delta > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS,
                          )}
                        >
                          {entry.ranked_delta > 0 ? `+${entry.ranked_delta}` : entry.ranked_delta}
                        </span>
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
                          <span className="@xl:hidden">{day.unix(entry.start_time).format("MMM D")}</span>
                          <span className="hidden @xl:inline">{day.unix(entry.start_time).fromNow()}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{day.unix(entry.start_time).format("MMM D, YYYY HH:mm")}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="hidden @4xl:table-cell">
                    <div className="flex items-center justify-end gap-0.5 text-muted-foreground tabular-nums">
                      {entry.match_id}
                      <CopyButton text={String(entry.match_id)} iconOnly title="Copy match ID" className="size-6" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden @4xl:table-cell">
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
                  <TableCell className="hidden @md:table-cell">
                    <ChevronDown
                      className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
                    />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={12} className="bg-muted/30 p-4">
                      <MatchRowDetails matchId={entry.match_id} accountId={accountId} ranks={ranks} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {paginatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                No matches found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
