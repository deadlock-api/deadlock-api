import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Users } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import type { TrackerHeroRow } from "~/lib/tracker/compute";

import { DashboardPanel, RateBar } from "./DashboardPanel";

type Sort = "matches" | "winrate" | "kdaRatio" | "soulsPerMin";
const columns: { key: Sort; label: string; name: string }[] = [
  { key: "matches", label: "Games", name: "games played" },
  { key: "winrate", label: "Win %", name: "win rate" },
  { key: "kdaRatio", label: "KDA", name: "KDA ratio" },
  { key: "soulsPerMin", label: "S/min", name: "souls per minute" },
];
const minimumOptions = [0, 5, 10] as const;

export function HeroStatsTable({
  rows,
  onSelectHero,
  onViewAllStats,
}: {
  rows: TrackerHeroRow[];
  onSelectHero: (heroId: number) => void;
  onViewAllStats: () => void;
}) {
  const [sort, setSort] = useState<Sort>("matches");
  const [direction, setDirection] = useState<"ascending" | "descending">("descending");
  const [minimumMatches, setMinimumMatches] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const sorted = rows
    .filter((row) => row.matches >= minimumMatches)
    .sort(
      (a, b) =>
        (direction === "descending" ? b[sort] - a[sort] : a[sort] - b[sort]) ||
        b.matches - a.matches ||
        a.heroId - b.heroId,
    );
  const visible = expanded ? sorted : sorted.slice(0, 6);
  const SortIcon = direction === "descending" ? ArrowDown : ArrowUp;
  return (
    <DashboardPanel
      title="Hero pool"
      icon={Users}
      meta={
        <div className="flex items-center gap-2">
          <span>Min. games</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(minimumMatches)}
            onValueChange={(value) => {
              if (!value) return;
              setMinimumMatches(Number(value));
              setExpanded(false);
            }}
            aria-label="Minimum games per hero"
          >
            {minimumOptions.map((minimum) => (
              <ToggleGroupItem
                key={minimum}
                value={String(minimum)}
                className="h-7 px-2"
                aria-label={minimum === 0 ? "Any number of games" : `At least ${minimum} games`}
              >
                {minimum === 0 ? "All" : `${minimum}+`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      }
    >
      <output className="mb-2 block text-[10px] text-muted-foreground">
        Showing {visible.length} of {sorted.length} {sorted.length === 1 ? "hero" : "heroes"}
        {minimumMatches > 0 ? ` with ${minimumMatches}+ games in selected matches.` : " in selected matches."}
      </output>
      {sorted.length === 0 ? (
        <Empty className="border px-3 py-6 md:p-6">
          <EmptyHeader>
            <EmptyTitle>No heroes meet this minimum</EmptyTitle>
            <EmptyDescription>Choose fewer minimum games or broaden the match filters above.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={() => setMinimumMatches(0)}>
            Show all heroes
          </Button>
        </Empty>
      ) : (
        <Table aria-label="Hero performance in selected matches">
          <TableHeader>
            <TableRow>
              <TableHead className="h-7 pl-0">
                <span className="text-[10px] text-muted-foreground">Hero</span>
              </TableHead>
              {columns.map(({ key, label, name }) => (
                <TableHead key={key} className="h-7 px-1 text-right" aria-sort={sort === key ? direction : "none"}>
                  <button
                    type="button"
                    aria-label={`Sort by ${name}, ${sort === key && direction === "descending" ? "ascending" : "descending"}`}
                    onClick={() => {
                      setDirection(sort === key && direction === "descending" ? "ascending" : "descending");
                      setSort(key);
                    }}
                    className="inline-flex items-center gap-0.5 rounded py-1 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {label}
                    {sort === key && <SortIcon aria-hidden="true" className="size-2.5" />}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.heroId}>
                <TableCell className="py-1.5 pr-1 pl-0">
                  <button
                    type="button"
                    onClick={() => onSelectHero(row.heroId)}
                    className="group flex items-center gap-1.5 rounded text-left focus-visible:outline-2 focus-visible:outline-ring"
                    title="Filter matches to this hero"
                  >
                    <span aria-hidden="true">
                      <HeroImage heroId={row.heroId} className="size-7 rounded" />
                    </span>
                    <HeroName heroId={row.heroId} className="max-w-24 text-xs font-medium group-hover:text-primary" />
                    <ArrowUpRight aria-hidden="true" className="size-3 text-muted-foreground" />
                  </button>
                </TableCell>
                <TableCell className="px-1 py-1.5 text-right">
                  <span className="text-xs tabular-nums">{row.matches.toLocaleString("en-US")}</span>
                </TableCell>
                <TableCell className="px-1 py-1.5 text-right">
                  <div className="ml-auto flex w-12 flex-col gap-1 text-xs tabular-nums">
                    <span>{(row.winrate * 100).toFixed(0)}%</span>
                    <RateBar wins={row.wins} matches={row.matches} />
                  </div>
                </TableCell>
                <TableCell className="px-1 py-1.5 text-right">
                  <span className="text-xs tabular-nums">{row.kdaRatio.toFixed(2)}</span>
                </TableCell>
                <TableCell className="px-1 py-1.5 text-right">
                  <span className="text-xs tabular-nums">{Math.round(row.soulsPerMin).toLocaleString("en-US")}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {sorted.length > 6 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 w-full"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer heroes" : `Show all ${sorted.length} heroes`}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={onViewAllStats}>
        All Hero Stats
        <ArrowRight data-icon="inline-end" />
      </Button>
    </DashboardPanel>
  );
}
