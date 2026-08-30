import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { PlayerMatchHistoryEntry, Rank } from "deadlock_api_client";
import { ChevronDown, UsersRound } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { HeroImage } from "~/components/HeroImage";
import { PaginationControls } from "~/components/PaginationControls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import { formatMatchDuration, isWin, MATCH_MODE_LABELS_BY_ID } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { MatchRowDetails } from "./MatchRowDetails";

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

  const totalPages = Math.max(1, Math.ceil(entries.length / itemsPerPage));
  const paginatedEntries = useMemo(
    () => entries.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage),
    [entries, currentPage, itemsPerPage],
  );

  return (
    <div className="space-y-3">
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
            <TableHead className="w-14">Result</TableHead>
            <TableHead>Hero</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead className="text-right">K / D / A</TableHead>
            <TableHead className="text-right">Souls</TableHead>
            <TableHead className="text-right" title="Last hits / Denies">
              LH / DN
            </TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Rank</TableHead>
            <TableHead className="text-right">Played</TableHead>
            <TableHead className="w-8" />
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry) => {
            const win = isWin(entry);
            const expanded = expandedMatchId === entry.match_id;
            return (
              <Fragment key={entry.match_id}>
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
                      <span className="max-w-[120px] truncate">{heroNames?.get(entry.hero_id) ?? "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {MATCH_MODE_LABELS_BY_ID[entry.match_mode] ?? "Unknown"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.player_kills} / {entry.player_deaths} / {entry.player_assists}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{entry.net_worth.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {entry.last_hits} / {entry.denies}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMatchDuration(entry.match_duration_s)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {entry.ranked_display_badge != null && entry.ranked_display_badge > 0 && (
                        <BadgeImage badge={entry.ranked_display_badge} ranks={ranks} className="size-6" />
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
                        <span>{day.unix(entry.start_time).fromNow()}</span>
                      </TooltipTrigger>
                      <TooltipContent>{day.unix(entry.start_time).format("MMM D, YYYY HH:mm")}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
                    <ChevronDown
                      className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
                    />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={11} className="bg-muted/30 p-4">
                      <MatchRowDetails matchId={entry.match_id} accountId={accountId} ranks={ranks} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {paginatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                No matches found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
