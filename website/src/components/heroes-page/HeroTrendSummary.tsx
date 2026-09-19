import { ArrowDownRight, ArrowUpRight, Download, Minus } from "lucide-react";
import { useMemo, useState } from "react";

import { SortableHeader } from "~/components/heroes-page/SortableHeader";
import { HeroImage } from "~/components/HeroImage";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import {
  formatTrendChange,
  formatTrendValue,
  heroTrendsCsv,
  isPercentageTrend,
  summarizeHeroTrend,
  type HeroTrendPoint,
  type HeroTrendStat,
} from "~/lib/hero-trends";
import { cn } from "~/lib/utils";

type SummarySortKey = "hero" | "firstValue" | "latestValue" | "change" | "buckets";

export function HeroTrendSummary({
  points,
  heroes,
  stat,
  interval,
}: {
  points: HeroTrendPoint[];
  heroes: { id: number; name: string; color: string }[];
  stat: HeroTrendStat;
  interval: string;
}) {
  const [sort, setSort] = useState<{ key: SummarySortKey; direction: "asc" | "desc" }>({
    key: "hero",
    direction: "asc",
  });
  const summaries = useMemo(
    () =>
      heroes.flatMap((hero) => {
        const summary = summarizeHeroTrend(points, hero.id);
        return summary ? [{ hero, summary }] : [];
      }),
    [heroes, points],
  );
  const rows = useMemo(() => {
    return summaries.toSorted((a, b) => {
      const direction = sort.direction === "asc" ? 1 : -1;
      if (sort.key === "hero") return a.hero.name.localeCompare(b.hero.name) * direction;
      const aValue = a.summary[sort.key];
      const bValue = b.summary[sort.key];
      if (aValue == null) return bValue == null ? a.hero.name.localeCompare(b.hero.name) : 1;
      if (bValue == null) return -1;
      return (aValue - bValue) * direction || a.hero.name.localeCompare(b.hero.name);
    });
  }, [summaries, sort]);
  const onSort = (key: SummarySortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key ? (current.direction === "asc" ? "desc" : "asc") : key === "hero" ? "asc" : "desc",
    }));
  const dateFormat = interval === "start_time_hour" ? "MMM D, HH:mm" : "MMM D, YYYY";

  function exportCsv() {
    const blob = new Blob(
      [
        heroTrendsCsv(
          points,
          rows.map(({ hero }) => hero),
          stat,
          interval,
        ),
      ],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hero-trends-${stat}-${interval.replace("start_time_", "")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Card className="gap-2 py-3">
      <CardHeader className="px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <h3>Selected hero comparison</h3>
            </CardTitle>
            <CardDescription>First → latest available bucket · UTC</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download data-icon="inline-start" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-3">
        <Table aria-label="Selected hero trend comparison">
          <TableHeader>
            <TableRow>
              {(
                [
                  ["hero", "Hero"],
                  ["latestValue", "Latest recorded"],
                  ["change", `Change${isPercentageTrend(stat) ? " (pp)" : ""}`],
                  ["firstValue", "First recorded"],
                  ["buckets", "Data points"],
                ] as const
              ).map(([key, label]) => (
                <SortableHeader
                  key={key}
                  label={label}
                  sortKey={key}
                  activeSortKey={sort.key}
                  sortDir={sort.direction}
                  onSort={onSort}
                  className={cn("text-left", key === "hero" && "sticky left-0 z-10 bg-card")}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ hero, summary }) => {
              const ChangeIcon =
                summary.change == null || summary.change === 0
                  ? Minus
                  : summary.change > 0
                    ? ArrowUpRight
                    : ArrowDownRight;
              return (
                <TableRow key={hero.id}>
                  <TableCell className="sticky left-0 z-10 bg-card py-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-6 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: hero.color }}
                      />
                      <span aria-hidden="true" className="hidden shrink-0 sm:block">
                        <HeroImage heroId={hero.id} className="size-6" />
                      </span>
                      <span className="max-w-20 truncate sm:max-w-none" title={hero.name}>
                        {hero.name}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="py-1.5">
                    <div className="flex flex-col gap-x-2 tabular-nums xl:flex-row xl:items-baseline">
                      <span className="font-semibold">{formatTrendValue(summary.latestValue, stat)}</span>
                      <span className="text-xs text-muted-foreground">
                        {day.utc(summary.latestDate).format(dateFormat)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <ChangeIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                      {summary.change == null ? "Not enough data" : formatTrendChange(summary.change, stat)}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex flex-col gap-x-2 tabular-nums xl:flex-row xl:items-baseline">
                      <span>{formatTrendValue(summary.firstValue, stat)}</span>
                      <span className="text-xs text-muted-foreground">
                        {day.utc(summary.firstDate).format(dateFormat)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex flex-col gap-x-2 tabular-nums xl:flex-row xl:items-baseline">
                      <span>{summary.buckets.toLocaleString("en-US")} buckets</span>
                      {summary.latestMatches != null && (
                        <span className="text-xs text-muted-foreground">
                          {summary.latestMatches.toLocaleString("en-US")} matches in latest
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {isPercentageTrend(stat) && "pp = percentage points. "}
          Changes compare individual buckets; available dates may differ by hero. CSV includes all selected data points.
        </p>
      </CardContent>
    </Card>
  );
}
