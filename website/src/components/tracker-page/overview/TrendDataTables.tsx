import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import type { Activity, RankHistoryPoint } from "~/lib/tracker/compute";

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
  const tableRef = useRef<HTMLDivElement>(null);
  const focusAfterLoad = useRef<number | null>(null);
  useEffect(() => {
    if (visibleCount <= PAGE_SIZE || focusAfterLoad.current == null) return;
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-rank-match="${focusAfterLoad.current}"]`)?.focus();
    focusAfterLoad.current = null;
  }, [visibleCount]);
  const latestFirst = [...ranks].reverse();
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
          {latestFirst.slice(0, visibleCount).map((point) => (
            <TableRow key={point.matchId}>
              <TableHead scope="row">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto justify-start px-0 py-1"
                  data-rank-match={point.matchId}
                  onClick={() => onOpenMatch(point.matchId)}
                  aria-label={`Open match ${point.matchId}, ${day.unix(point.time).format("MMM D, YYYY, HH:mm")}`}
                  title={`Match ${point.matchId}`}
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

export function ActivityTable({ activity }: { activity: Activity }) {
  return (
    <Table>
      <TableCaption>
        Selected matches, newest period first. Empty periods are included to show breaks in activity. Dates use your
        local time.
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
                <span className="block">
                  {day.unix(bucket.bucketStartUnix).format(activity.granularity === "week" ? "MMM D" : "MMM")}
                </span>
                <span className="text-xs text-muted-foreground">{day.unix(bucket.bucketStartUnix).format("YYYY")}</span>
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
