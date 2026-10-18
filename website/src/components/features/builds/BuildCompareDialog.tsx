import { useState } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { useItemPrices } from "~/components/features/builds/build-hooks";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { NoValue } from "~/components/ui/no-value";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "~/components/ui/table";
import {
  BUILD_METRICS,
  type BuildMetric,
  type BuildPerformanceTotals,
  metricDelta,
  metricNoise,
} from "~/lib/build-performance";
import { BUILD_SLOT_LABEL, BUILD_SLOTS, buildItemIds, type BuildRow, buildSlotCost } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import { winRateNoise } from "~/lib/wilson";

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
      <PanelSection variant="label" title={title}>
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
  const prices = useItemPrices();
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
  // Each shop category's share of what the build's items cost; null without contents or prices.
  const slotCost = (row: BuildRow) => {
    const cost = row.meta ? buildSlotCost(row.meta, prices) : null;
    return cost && cost.total > 0 ? cost : null;
  };
  const slotsA = slotCost(build);
  const slotsB = slotCost(other);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex max-h-5/6 flex-col gap-3 overflow-y-auto *:shrink-0">
        <DialogHeader>
          <DialogTitle>Compare {nameOf(build)}</DialogTitle>
          <DialogDescription className="sr-only">
            {nameOf(build)} against another build of the same hero
          </DialogDescription>
        </DialogHeader>
        <Field orientation="horizontal" label="With">
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
        {/* Two tables side by side: usage and combat, then economy and survival. */}
        <div className="@container">
          <div className="grid gap-x-6 gap-y-3 @2xl:grid-cols-2">
            <Table density="dense" aria-label={`${nameOf(build)} against ${nameOf(other)}: usage and combat`}>
              <TableHeader>
                <TableRow>
                  <TableHead tone="muted">Stat</TableHead>
                  <TableHead className="text-end">
                    Selected<span className="sr-only">: {nameOf(build)}</span>
                  </TableHead>
                  <TableHead className="text-end">
                    Compared<span className="sr-only">: {nameOf(other)}</span>
                  </TableHead>
                  <TableHead tone="muted" className="text-end">
                    Vs. selected
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BASE_ROWS.map((row) => {
                  const a = row.value(build);
                  const b = row.value(other);
                  return (
                    <TableRow key={row.label}>
                      <TableRowHeader tone="muted">{row.label}</TableRowHeader>
                      <TableCell className="text-end tabular-nums">{row.format(a)}</TableCell>
                      <TableCell className="text-end tabular-nums">{row.format(b)}</TableCell>
                      <TableCell className="text-end">
                        <Delta
                          value={row.rate ? b - a : a !== 0 ? b / a - 1 : null}
                          unit={row.rate ? " pp" : undefined}
                          polarity={row.label === "Win rate" ? "higher-is-better" : "neutral"}
                          threshold={row.label === "Win rate" ? winRateNoise(build.matches, other.matches) : 0}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {BUILD_METRICS.filter((metric) => metric.group === "combat").map((metric) => {
                  const a = totalsA ? metric.value(totalsA) : null;
                  const b = totalsB ? metric.value(totalsB) : null;
                  return (
                    <TableRow key={metric.key}>
                      <TableRowHeader tone="muted">{metric.label}</TableRowHeader>
                      <MetricCell metric={metric} totals={totalsA} />
                      <MetricCell metric={metric} totals={totalsB} />
                      <TableCell className="text-end">
                        <Delta
                          value={metricDelta(metric, b, a)}
                          unit={metric.delta === "points" ? " pp" : undefined}
                          polarity={metric.polarity}
                          threshold={metricNoise(metric)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Table density="dense" aria-label={`${nameOf(build)} against ${nameOf(other)}: economy and survival`}>
              <TableHeader>
                <TableRow>
                  <TableHead tone="muted">Stat</TableHead>
                  <TableHead className="text-end">
                    Selected<span className="sr-only">: {nameOf(build)}</span>
                  </TableHead>
                  <TableHead className="text-end">
                    Compared<span className="sr-only">: {nameOf(other)}</span>
                  </TableHead>
                  <TableHead tone="muted" className="text-end">
                    Vs. selected
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BUILD_METRICS.filter((metric) => metric.group !== "combat").map((metric) => {
                  const a = totalsA ? metric.value(totalsA) : null;
                  const b = totalsB ? metric.value(totalsB) : null;
                  return (
                    <TableRow key={metric.key}>
                      <TableRowHeader tone="muted">{metric.label}</TableRowHeader>
                      <MetricCell metric={metric} totals={totalsA} />
                      <MetricCell metric={metric} totals={totalsB} />
                      <TableCell className="text-end">
                        <Delta
                          value={metricDelta(metric, b, a)}
                          unit={metric.delta === "points" ? " pp" : undefined}
                          polarity={metric.polarity}
                          threshold={metricNoise(metric)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {BUILD_SLOTS.map((slot) => {
                  const a = slotsA && slotsA.bySlot[slot] / slotsA.total;
                  const b = slotsB && slotsB.bySlot[slot] / slotsB.total;
                  return (
                    <TableRow key={slot}>
                      <TableRowHeader tone="muted">{BUILD_SLOT_LABEL[slot]} souls</TableRowHeader>
                      <TableCell className="text-end tabular-nums">
                        {a === null ? <NoValue /> : formatPercent(a, 0)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {b === null ? <NoValue /> : formatPercent(b, 0)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Delta value={a !== null && b !== null ? b - a : null} unit=" pp" polarity="neutral" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="@container grid gap-3 sm:grid-cols-3">
          <ItemRow title={`Only in ${nameOf(build)}`} itemIds={itemsA.filter((id) => !setB.has(id))} />
          <ItemRow title="In both" itemIds={itemsA.filter((id) => setB.has(id))} />
          <ItemRow title={`Only in ${nameOf(other)}`} itemIds={itemsB.filter((id) => !setA.has(id))} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
