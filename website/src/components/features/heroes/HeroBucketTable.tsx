import { useMemo } from "react";

import { HeroName } from "~/components/domain/assets/HeroName";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { useSort } from "~/components/ui/hooks/use-sort";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "~/components/ui/table";

type SortKey = "hero" | `bucket-${number}`;

export interface HeroBucketRow {
  heroId: number;
  name: string;
  /** One reading per bucket, in the order of `buckets`; null where the hero has too few matches in it. */
  values: (number | null)[];
}

/**
 * Every hero's reading of a chart's stat in each of its buckets (match lengths, ranks): the numbers behind the plot,
 * for every hero rather than only the ones drawn.
 */
export function HeroBucketTable({
  title,
  buckets,
  rows,
  format,
}: {
  title: string;
  buckets: readonly string[];
  rows: readonly HeroBucketRow[];
  format: (value: number) => string;
}) {
  // Names read A to Z, numbers from the largest.
  const {
    sortKey,
    dir,
    toggle: onSort,
  } = useSort<SortKey>({
    defaultValue: { key: "hero", dir: "asc" },
    firstDir: (key) => (key === "hero" ? "asc" : "desc"),
  });
  const sorted = useMemo(() => {
    const direction = dir === "asc" ? 1 : -1;
    const index = sortKey === "hero" ? -1 : Number(sortKey.slice("bucket-".length));
    return rows.toSorted((a, b) => {
      if (index < 0) return a.name.localeCompare(b.name) * direction;
      const aValue = a.values[index];
      const bValue = b.values[index];
      // Heroes without a reading stay at the bottom in both directions.
      if (aValue == null) return bValue == null ? a.name.localeCompare(b.name) : 1;
      if (bValue == null) return -1;
      return (aValue - bValue) * direction || a.name.localeCompare(b.name);
    });
  }, [rows, sortKey, dir]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <Heading as="h3">{title}</Heading>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        <Table aria-label={title} density="compact">
          <TableHeader>
            <TableRow>
              <SortableHeader
                label="Hero"
                sortKey="hero"
                activeSortKey={sortKey}
                sortDir={dir}
                onSortChange={onSort}
                align="start"
                data-pinned
              />
              {buckets.map((bucket, i) => (
                <SortableHeader
                  key={bucket}
                  label={bucket}
                  sortKey={`bucket-${i}`}
                  activeSortKey={sortKey}
                  sortDir={dir}
                  onSortChange={onSort}
                  align="end"
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.heroId}>
                <TableCell data-pinned>
                  <HeroName heroId={row.heroId} linkToDetail />
                </TableCell>
                {row.values.map((value, i) => (
                  <TableCell key={buckets[i]} className="text-end tabular-nums">
                    {value == null ? <span className="text-muted-foreground">—</span> : format(value)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
