import { ArrowUpRight, Users } from "lucide-react";
import { type ReactNode, useState } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Field } from "~/components/ui/field";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip } from "~/components/ui/tooltip";
import type { TrackerHeroRow } from "~/lib/tracker/compute";

type Sort = "matches" | "winrate" | "kdaRatio" | "soulsPerMin";
const columns: { key: Sort; label: string; name: string }[] = [
  { key: "matches", label: "Games", name: "games played" },
  { key: "winrate", label: "Win %", name: "win rate" },
  { key: "kdaRatio", label: "KDA", name: "KDA ratio" },
  { key: "soulsPerMin", label: "S/min", name: "souls per minute" },
];
const MINIMUM_GAMES = [0, 5, 10] as const;

export function HeroStatsTable({
  rows,
  onSelectHero,
  details,
}: {
  rows: TrackerHeroRow[];
  onSelectHero: (heroId: number) => void;
  details: (options: {
    minimumMatches: number;
    sort: Sort;
    direction: "ascending" | "descending";
    close: () => void;
  }) => ReactNode;
}) {
  const [sort, setSort] = useState<Sort>("matches");
  const [direction, setDirection] = useState<"ascending" | "descending">("descending");
  const [minimumMatches, setMinimumMatches] = useState(0);
  const [open, setOpen] = useState(false);
  const sorted = rows
    .filter((row) => row.matches >= minimumMatches)
    .sort(
      (a, b) =>
        (direction === "descending" ? b[sort] - a[sort] : a[sort] - b[sort]) ||
        b.matches - a.matches ||
        a.heroId - b.heroId,
    );
  const visible = sorted.slice(0, 3);
  const sortDir = direction === "descending" ? "desc" : "asc";
  return (
    <PanelWithDetails
      open={open}
      onOpenChange={setOpen}
      details={details({ minimumMatches, sort, direction, close: () => setOpen(false) })}
      title="Hero pool"
      icon={Users}
      footer={
        <output>
          {visible.length} of {sorted.length} {sorted.length === 1 ? "hero" : "heroes"}
          {minimumMatches > 0 ? ` · ${minimumMatches}+ games` : " · selected matches"}
        </output>
      }
      actions={
        <Field orientation="horizontal" label="Min. games">
          <Segmented
            size="sm"
            width="hug"
            value={String(minimumMatches)}
            onValueChange={(value) => setMinimumMatches(Number(value))}
            aria-label="Minimum games per hero"
          >
            {MINIMUM_GAMES.map((minimum) => (
              <SegmentedItem
                key={minimum}
                value={String(minimum)}
                aria-label={minimum === 0 ? "Any number of games" : `At least ${minimum} games`}
              >
                {minimum === 0 ? "All" : `${minimum}+`}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
      }
    >
      {sorted.length === 0 ? (
        <EmptyState
          className="px-3 py-6 md:p-6"
          title="No heroes meet this minimum"
          description="Choose fewer minimum games or broaden the match filters above."
          action={
            <Button variant="outline" size="sm" onClick={() => setMinimumMatches(0)}>
              Reset minimum games
            </Button>
          }
        />
      ) : (
        <Table density="dense" aria-label="Hero performance in selected matches">
          <TableHeader>
            <TableRow>
              <TableHead className="ps-0">
                <span className="text-3xs text-muted-foreground">Hero</span>
              </TableHead>
              {columns.map(({ key, label, name }) => (
                <SortableHeader
                  key={key}
                  label={label}
                  sortKey={key}
                  activeSortKey={sort}
                  sortDir={sortDir}
                  align="end"
                  size="sm"
                  className="text-3xs text-muted-foreground"
                  sortLabel={`Sort by ${name}, ${sort === key && direction === "descending" ? "ascending" : "descending"}`}
                  onSort={(next) => {
                    setDirection(sort === next && direction === "descending" ? "ascending" : "descending");
                    setSort(next);
                  }}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.heroId}>
                <TableCell className="ps-0">
                  <Tooltip content="Filter matches to this hero">
                    <Button
                      variant="ghost"
                      onClick={() => onSelectHero(row.heroId)}
                      className="group h-auto gap-1.5 px-1 py-0.5"
                    >
                      <span aria-hidden="true">
                        <HeroImage heroId={row.heroId} shape="rounded" className="size-6" title="" />
                      </span>
                      <HeroName heroId={row.heroId} className="max-w-24 text-xs font-medium group-hover:text-primary" />
                      <ArrowUpRight aria-hidden="true" className="size-3 text-muted-foreground" />
                    </Button>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-end">
                  <span className="text-xs tabular-nums">{row.matches.toLocaleString("en-US")}</span>
                </TableCell>
                <TableCell className="text-end">
                  <div className="ms-auto flex w-12 flex-col gap-1 text-xs tabular-nums">
                    <span>{(row.winrate * 100).toFixed(0)}%</span>
                    <ProgressBar variant="thin" value={row.winrate} className="h-1" />
                  </div>
                </TableCell>
                <TableCell className="text-end">
                  <span className="text-xs tabular-nums">{row.kdaRatio.toFixed(2)}</span>
                </TableCell>
                <TableCell className="text-end">
                  <span className="text-xs tabular-nums">{Math.round(row.soulsPerMin).toLocaleString("en-US")}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PanelWithDetails>
  );
}
