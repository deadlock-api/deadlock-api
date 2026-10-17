import { ListOrdered } from "lucide-react";

import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { useSort } from "~/components/ui/hooks/use-sort";
import { ProgressBar } from "~/components/ui/progress-bar";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { type BuildRow, buildLanguageName } from "~/lib/build-stats";
import { formatPercent, formatShare, formatSignedPercent } from "~/lib/format";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";
import type { SteamProfileMap } from "~/queries/steam-queries";

type SortKey = "matches" | "players" | "winRate" | "lowerBound" | "updated";

const COLUMNS: { key: SortKey; label: string; name: string; className?: string }[] = [
  { key: "matches", label: "Matches", name: "matches" },
  { key: "players", label: "Players", name: "players", className: "hidden @3xl/builds:table-cell" },
  { key: "winRate", label: "Win rate", name: "win rate" },
  { key: "lowerBound", label: "Vs. avg", name: "confidence above the average" },
  { key: "updated", label: "Updated", name: "last update", className: "hidden @xl/builds:table-cell" },
];

const sortValue: Record<SortKey, (row: BuildRow) => number> = {
  matches: (row) => row.matches,
  players: (row) => row.players,
  winRate: (row) => row.winRate,
  lowerBound: (row) => row.interval[0],
  updated: (row) => row.meta?.updatedAt ?? 0,
};

/** Where the bar beside a win rate reaches its edge: ten points over or under the average. */
const VS_AVERAGE_SCALE = 0.1;

/** Every played build, sortable; a row press shows it in the detail panel. */
export function BuildTable({
  rows,
  profiles,
  metaPending,
  profilesPending,
  selectedId,
  onBuildIdChange,
}: {
  rows: readonly BuildRow[];
  profiles: SteamProfileMap;
  metaPending: boolean;
  profilesPending: boolean;
  selectedId: number;
  onBuildIdChange: (buildId: number) => void;
}) {
  const sort = useSort<SortKey>({ defaultValue: { key: "matches", dir: "desc" } });
  const sign = sort.dir === "desc" ? -1 : 1;
  const sorted = [...rows].sort(
    (a, b) =>
      sign * (sortValue[sort.sortKey](a) - sortValue[sort.sortKey](b)) ||
      b.matches - a.matches ||
      a.hero_build_id - b.hero_build_id,
  );
  const maxShare = Math.max(...rows.map((row) => row.share));

  return (
    // The table scrolls inside the panel, so the panel keeps one height beside the build details.
    <Panel className="@container/builds flex flex-col *:data-[slot=table-container]:max-h-136">
      <PanelHeader title={`${rows.length} builds`} icon={ListOrdered} size="sm" />
      <Table density="compact" aria-label="Builds by matches and win rate">
        <TableHeader position="sticky">
          <TableRow>
            <TableHead className="w-8 text-end text-xs text-muted-foreground">#</TableHead>
            <TableHead className="text-xs text-muted-foreground">Build</TableHead>
            {COLUMNS.map(({ key, label, name, className }) => (
              <SortableHeader
                key={key}
                label={label}
                sortKey={key}
                activeSortKey={sort.sortKey}
                sortDir={sort.dir}
                align="end"
                size="sm"
                className={cn("text-xs text-muted-foreground", className)}
                sortLabel={`Sort by ${name}`}
                onSortChange={sort.toggle}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, index) => {
            const selected = row.hero_build_id === selectedId;
            const author = row.meta ? profiles[row.meta.authorId] : undefined;
            const average = row.winRate - row.vsAverage;
            return (
              <TableRow
                key={row.hero_build_id}
                data-interactive=""
                data-state={selected ? "selected" : undefined}
                onClick={() => onBuildIdChange(row.hero_build_id)}
              >
                <TableCell className="text-end text-xs text-muted-foreground tabular-nums">{index + 1}</TableCell>
                <TableCell className="w-full max-w-0">
                  <div className="flex min-w-0 flex-col">
                    {row.meta ? (
                      <Button
                        variant="text"
                        aria-current={selected || undefined}
                        title={row.meta.name}
                        className="block max-w-full justify-start truncate text-start font-medium"
                        onClick={(event) => {
                          event.stopPropagation();
                          onBuildIdChange(row.hero_build_id);
                        }}
                      >
                        {row.meta.name}
                      </Button>
                    ) : metaPending ? (
                      <Skeleton className="h-5 w-40" />
                    ) : (
                      <Button
                        variant="text"
                        aria-current={selected || undefined}
                        className="justify-start text-muted-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          onBuildIdChange(row.hero_build_id);
                        }}
                      >
                        Build {row.hero_build_id}
                      </Button>
                    )}
                    <span className="truncate text-xs text-muted-foreground">
                      {row.meta ? (
                        <>
                          {author?.personaname ?? (profilesPending ? "…" : `Player ${row.meta.authorId}`)}
                          {row.meta.language !== 0 && ` · ${buildLanguageName(row.meta.language)}`}
                        </>
                      ) : (
                        `#${row.hero_build_id}`
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-end">
                  <div className="ms-auto flex w-16 flex-col items-end gap-1 tabular-nums">
                    <span>{row.matches.toLocaleString("en-US")}</span>
                    <ProgressBar
                      variant="thin"
                      value={maxShare > 0 ? row.share / maxShare : 0}
                      color={CHART_COLOR.share}
                      aria-label={`${formatShare(row.share)} of build matches`}
                      className="w-full"
                    />
                  </div>
                </TableCell>
                <TableCell className="hidden text-end tabular-nums @3xl/builds:table-cell">
                  {row.players.toLocaleString("en-US")}
                </TableCell>
                <TableCell className="text-end tabular-nums">{formatPercent(row.winRate)}</TableCell>
                <TableCell className="text-end">
                  <div className="ms-auto flex w-20 flex-col items-end gap-1">
                    <span className={cn("text-xs tabular-nums", TONE_TEXT[toneOf(verdictSign(row))])}>
                      {formatSignedPercent(row.vsAverage)}
                    </span>
                    <DivergingBar
                      value={row.vsAverage}
                      interval={[row.interval[0] - average, row.interval[1] - average]}
                      scale={VS_AVERAGE_SCALE}
                      className="w-full"
                    />
                  </div>
                </TableCell>
                <TableCell className="hidden text-end text-xs whitespace-nowrap text-muted-foreground tabular-nums @xl/builds:table-cell">
                  {row.meta ? day.unix(row.meta.updatedAt).utc().format("MMM D, YYYY") : ""}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}

/** A difference is colored only when the whole interval is on one side of the average. */
function verdictSign(row: BuildRow): number {
  return row.verdict === "above" ? 1 : row.verdict === "below" ? -1 : 0;
}
