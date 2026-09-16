import { ArrowUpRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import type { Activity, RankHistoryPoint } from "~/lib/tracker/compute";

import { PanelTooltip } from "../shared/PanelTooltipContent";
import { RankDelta } from "../shared/RankDelta";

const PAGE_SIZE = 50;

export function RankHistoryTable({
  ranks,
  rankName,
  onOpenMatch,
}: {
  ranks: RankHistoryPoint[];
  rankName: (badge: number) => string;
  onOpenMatch: (matchId: number) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [focusedMatchId, setFocusedMatchId] = useState<number | null>(null);
  const keyboardHelpId = useId();
  const tableRef = useRef<HTMLDivElement>(null);
  const focusAfterLoad = useRef<number | null>(null);
  useEffect(() => {
    if (visibleCount <= PAGE_SIZE || focusAfterLoad.current == null) return;
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-rank-match="${focusAfterLoad.current}"]`)?.focus();
    focusAfterLoad.current = null;
  }, [visibleCount]);
  const latestFirst = [...ranks].reverse();
  const visible = latestFirst.slice(0, visibleCount);
  const tabStop = visible.some((point) => point.matchId === focusedMatchId) ? focusedMatchId : visible[0]?.matchId;
  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = visible.findIndex((point) => point.matchId === Number(event.currentTarget.dataset.rankMatch));
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? visible.length - 1
          : index + (event.key === "ArrowDown" ? 1 : -1);
    const next = visible[nextIndex];
    if (next) tableRef.current?.querySelector<HTMLButtonElement>(`[data-rank-match="${next.matchId}"]`)?.focus();
  };
  if (ranks.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No recorded ranks</EmptyTitle>
          <EmptyDescription>
            No matches in this selection have a recorded rank badge. Try a different date range or mode.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div ref={tableRef} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Recorded badges and progress in the selected matches. Select a date to open its match.
      </p>
      <p id={keyboardHelpId} className="sr-only">
        Use the up and down arrow keys to browse recorded ranks, or Home and End for the first and last shown match.
        Press Enter to open a match.
      </p>
      <Table className="[&_td]:px-1 [&_th]:px-1">
        <TableCaption>
          Newest first. Rank progress is shown only when recorded; missing progress is marked with a dash.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Rank</TableHead>
            <TableHead className="text-right">Progress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((point) => (
            <TableRow key={point.matchId}>
              <TableHead scope="row">
                <PanelTooltip content={`Open match ${point.matchId}`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-auto justify-start px-0 py-1"
                    data-rank-match={point.matchId}
                    tabIndex={point.matchId === tabStop ? 0 : -1}
                    aria-describedby={keyboardHelpId}
                    onFocus={() => setFocusedMatchId(point.matchId)}
                    onKeyDown={navigate}
                    onClick={() => onOpenMatch(point.matchId)}
                    aria-label={`Open match ${point.matchId}, ${day.unix(point.time).format("MMM D, YYYY, HH:mm")}`}
                  >
                    <time dateTime={day.unix(point.time).toISOString()} className="text-left">
                      <span className="block">
                        {day.unix(point.time).format("MMM D")}
                        <span className="hidden @xs/stats-dialog:inline">, {day.unix(point.time).format("YYYY")}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <span className="@xs/stats-dialog:hidden">{day.unix(point.time).format("YYYY")} · </span>
                        {day.unix(point.time).format("HH:mm")}
                      </span>
                    </time>
                    <ArrowUpRight data-icon="inline-end" className="hidden @xs/stats-dialog:block" />
                  </Button>
                </PanelTooltip>
              </TableHead>
              <TableCell className="whitespace-normal">{rankName(point.badge)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {point.delta == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : point.delta === 0 ? (
                  "0"
                ) : (
                  <RankDelta value={point.delta} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <output className="text-xs text-muted-foreground">
          Showing {Math.min(visibleCount, ranks.length)} of {ranks.length} recorded ranks
        </output>
        {visibleCount < ranks.length && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              focusAfterLoad.current = latestFirst[visibleCount].matchId;
              setVisibleCount((count) => count + PAGE_SIZE);
            }}
          >
            Show older matches
          </Button>
        )}
      </div>
    </div>
  );
}

export function ActivityTable({
  activity,
  onSelectPeriod,
}: {
  activity: Activity;
  onSelectPeriod: (bucketStartUnix: number) => void;
}) {
  return (
    <Table>
      <TableCaption>
        Selected matches, newest period first. Empty periods are included to show breaks in activity. Dates use your
        local time. Select a period to show its matches.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{activity.granularity === "week" ? "Week of" : "Month"}</TableHead>
          <TableHead className="text-right">Matches</TableHead>
          <TableHead className="hidden text-right @xs/stats-dialog:table-cell">Record</TableHead>
          <TableHead className="text-right">Win rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...activity.buckets].reverse().map((bucket) => {
          const matches = bucket.wins + bucket.losses;
          return (
            <TableRow key={bucket.bucketStartUnix}>
              <TableHead scope="row">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto justify-start px-0 py-1"
                  disabled={matches === 0}
                  onClick={() => onSelectPeriod(bucket.bucketStartUnix)}
                  aria-label={`Show matches from ${activity.granularity === "week" ? "week of " : ""}${day.unix(bucket.bucketStartUnix).format(activity.granularity === "week" ? "MMM D, YYYY" : "MMMM YYYY")}`}
                >
                  <time dateTime={day.unix(bucket.bucketStartUnix).format("YYYY-MM-DD")} className="text-left">
                    <span className="block">
                      {day.unix(bucket.bucketStartUnix).format(activity.granularity === "week" ? "MMM D" : "MMM")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {day.unix(bucket.bucketStartUnix).format("YYYY")}
                    </span>
                  </time>
                  <ArrowUpRight data-icon="inline-end" className="hidden @xs/stats-dialog:block" />
                </Button>
              </TableHead>
              <TableCell className="text-right tabular-nums">
                {matches}
                <span className="block text-xs text-muted-foreground @xs/stats-dialog:hidden">
                  {bucket.wins}W / {bucket.losses}L
                </span>
              </TableCell>
              <TableCell className="hidden text-right tabular-nums @xs/stats-dialog:table-cell">
                {bucket.wins}W / {bucket.losses}L
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {matches ? `${((bucket.wins / matches) * 100).toFixed(1)}%` : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
