import { useState } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { NoValue } from "~/components/ui/no-value";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { BUILD_METRICS, type BuildMetric, type BuildPerformanceTotals, metricDelta } from "~/lib/build-performance";
import { buildItemIds, type BuildRow } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";

const nameOf = (row: BuildRow) => row.meta?.name ?? `Build ${row.hero_build_id}`;

/** The rows every comparison has, from the build stats themselves. */
const BASE_ROWS: {
  label: string;
  value: (row: BuildRow) => number;
  format: (value: number) => string;
  /** A rate, whose difference is in points; an amount's is relative. */
  rate?: boolean;
}[] = [
  { label: "Matches", value: (row) => row.matches, format: (value) => value.toLocaleString("en-US") },
  { label: "Players", value: (row) => row.players, format: (value) => value.toLocaleString("en-US") },
  { label: "Win rate", value: (row) => row.winRate, format: (value) => formatPercent(value), rate: true },
  { label: "Share", value: (row) => row.share, format: (value) => formatPercent(value), rate: true },
];

function ItemRow({ title, itemIds }: { title: string; itemIds: readonly number[] }) {
  return (
    <section className="flex min-w-0 flex-col">
      <PanelSection title={title}>
        <span className="tabular-nums">{itemIds.length}</span>
      </PanelSection>
      {itemIds.length === 0 ? (
        <p className="px-4 py-2 text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 px-4 py-2">
          {itemIds.map((itemId) => (
            <li key={itemId}>
              <ItemImage itemId={itemId} className="size-8" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MetricCell({ metric, totals }: { metric: BuildMetric; totals: BuildPerformanceTotals | undefined }) {
  const value = totals ? metric.value(totals) : null;
  return <TableCell className="text-end tabular-nums">{value === null ? <NoValue /> : metric.format(value)}</TableCell>;
}

/**
 * Two builds side by side: their numbers, how the second one's differ, and which items only one of them lists. The
 * first is the selected build; the second is picked in the dialog, the most played other build at first.
 */
export function BuildCompareDialog({
  open,
  onOpenChange,
  build,
  rows,
  performance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  build: BuildRow;
  rows: readonly BuildRow[];
  performance: Readonly<Record<number, BuildPerformanceTotals>> | undefined;
}) {
  const others = rows.filter((row) => row.hero_build_id !== build.hero_build_id);
  const [otherId, setOtherId] = useState<number | null>(null);
  const other = others.find((row) => row.hero_build_id === otherId) ?? others[0];
  if (!other) return null;

  const itemsA = build.meta ? buildItemIds(build.meta) : [];
  const itemsB = other.meta ? buildItemIds(other.meta) : [];
  const setB = new Set(itemsB);
  const setA = new Set(itemsA);
  const totalsA = performance?.[build.hero_build_id];
  const totalsB = performance?.[other.hero_build_id];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex max-h-5/6 flex-col gap-3 overflow-y-auto *:shrink-0">
        <DialogHeader>
          <DialogTitle>Compare builds</DialogTitle>
          <DialogDescription className="sr-only">
            {nameOf(build)} against another build of the same hero
          </DialogDescription>
        </DialogHeader>
        <Field orientation="horizontal" label="Compare with">
          <Select value={String(other.hero_build_id)} onValueChange={(value) => setOtherId(Number(value))}>
            <SelectTrigger size="sm" className="max-w-80 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {others.map((row) => (
                <SelectItem key={row.hero_build_id} value={String(row.hero_build_id)}>
                  {nameOf(row)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Table density="dense" aria-label={`${nameOf(build)} against ${nameOf(other)}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-muted-foreground">Stat</TableHead>
              <TableHead className="max-w-40 truncate text-end text-xs" title={nameOf(build)}>
                {nameOf(build)}
              </TableHead>
              <TableHead className="max-w-40 truncate text-end text-xs" title={nameOf(other)}>
                {nameOf(other)}
              </TableHead>
              <TableHead className="text-end text-xs text-muted-foreground">Difference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BASE_ROWS.map((row) => {
              const a = row.value(build);
              const b = row.value(other);
              return (
                <TableRow key={row.label}>
                  <TableCell className="text-muted-foreground">{row.label}</TableCell>
                  <TableCell className="text-end tabular-nums">{row.format(a)}</TableCell>
                  <TableCell className="text-end tabular-nums">{row.format(b)}</TableCell>
                  <TableCell className="text-end">
                    <Delta
                      value={row.rate ? b - a : a !== 0 ? b / a - 1 : null}
                      unit={row.rate ? " pp" : undefined}
                      polarity={row.label === "Win rate" ? "higher-is-better" : "neutral"}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {BUILD_METRICS.map((metric) => {
              const a = totalsA ? metric.value(totalsA) : null;
              const b = totalsB ? metric.value(totalsB) : null;
              return (
                <TableRow key={metric.key}>
                  <TableCell className="text-muted-foreground">{metric.label}</TableCell>
                  <MetricCell metric={metric} totals={totalsA} />
                  <MetricCell metric={metric} totals={totalsB} />
                  <TableCell className="text-end">
                    <Delta
                      value={metricDelta(metric, b, a)}
                      unit={metric.delta === "points" ? " pp" : undefined}
                      polarity={metric.polarity}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="@container grid gap-3 sm:grid-cols-3">
          <ItemRow title={`Only in ${nameOf(build)}`} itemIds={itemsA.filter((id) => !setB.has(id))} />
          <ItemRow title="In both" itemIds={itemsA.filter((id) => setB.has(id))} />
          <ItemRow title={`Only in ${nameOf(other)}`} itemIds={itemsB.filter((id) => !setA.has(id))} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
