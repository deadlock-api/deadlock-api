import { ArrowDown, ArrowUpRight, Users } from "lucide-react";
import { useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { TrackerHeroRow } from "~/lib/tracker/compute";

import { DashboardPanel, RateBar } from "./DashboardPanel";

type Sort = "matches" | "winrate" | "kdaRatio" | "soulsPerMin";
const columns: { key: Sort; label: string }[] = [
  { key: "matches", label: "Games" },
  { key: "winrate", label: "Win %" },
  { key: "kdaRatio", label: "KDA" },
  { key: "soulsPerMin", label: "S/min" },
];

export function HeroStatsTable({
  rows,
  onSelectHero,
}: {
  rows: TrackerHeroRow[];
  onSelectHero: (heroId: number) => void;
}) {
  const [sort, setSort] = useState<Sort>("matches");
  const [expanded, setExpanded] = useState(false);
  const sorted = [...rows].sort((a, b) => b[sort] - a[sort] || b.matches - a.matches || a.heroId - b.heroId);
  const visible = expanded ? sorted : sorted.slice(0, 6);
  return (
    <DashboardPanel title="Hero pool" icon={Users} meta={`${rows.length} heroes · click to filter`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-7 pl-0">
              <span className="text-[10px] text-muted-foreground">Hero</span>
            </TableHead>
            {columns.map(({ key, label }) => (
              <TableHead key={key} className="h-7 px-1 text-right" aria-sort={sort === key ? "descending" : "none"}>
                <button
                  type="button"
                  onClick={() => setSort(key)}
                  className="inline-flex items-center gap-0.5 rounded py-1 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {label}
                  {sort === key && <ArrowDown aria-hidden="true" className="size-2.5" />}
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
      {rows.length > 6 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 w-full"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show top 6" : `Show all ${rows.length} heroes`}
        </Button>
      )}
    </DashboardPanel>
  );
}
