import type { HashMapValue } from "deadlock_api_client";
import { useMemo } from "react";

import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogPager, DialogTitle } from "~/components/ui/dialog";
import { InlineStat } from "~/components/ui/inline-stat";
import { Inline } from "~/components/ui/stack";
import { buildDistributionCurve } from "~/lib/distribution-percentile";
import { formatRange } from "~/lib/format";
import { formatPlayerMetricValue, type PlayerMetricDefinition } from "~/lib/player-metrics";

import { DistributionChart } from "./distribution-chart";

export function PlayerMetricDistributionDialog({
  metric,
  values,
  onClose,
  previousMetric,
  nextMetric,
  onPrev,
  onNext,
}: {
  metric: PlayerMetricDefinition | null;
  /** The metrics the pager steps to, for its buttons' names. */
  previousMetric: PlayerMetricDefinition | null;
  nextMetric: PlayerMetricDefinition | null;
  values: HashMapValue | undefined;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const fmt = (v: number) => (metric ? (formatPlayerMetricValue(v, metric.format) ?? "") : String(v));
  const curve = useMemo(() => (values ? buildDistributionCurve(values) : []), [values]);

  return (
    <Dialog open={metric != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {metric && (
          <>
            <DialogHeader>
              {/* The pager shares the title's row, clear of the close button. */}
              <Inline justify="between" wrap="nowrap" gap={2} className="pe-8">
                <DialogTitle>{metric.label} distribution</DialogTitle>
                <DialogPager
                  previousLabel={`Previous: ${previousMetric?.label ?? "metric"}`}
                  nextLabel={`Next: ${nextMetric?.label ?? "metric"}`}
                  onPrevious={onPrev}
                  onNext={onNext}
                  status={`${metric.label} distribution`}
                />
              </Inline>
            </DialogHeader>

            {values && curve.length >= 3 ? (
              <>
                <DistributionChart label={metric.label} curve={curve} values={values} fmt={fmt} height={440} />
                <Inline justify="center" gap={6} className="gap-y-1 text-xs">
                  <InlineStat label="Average" value={fmt(values.avg)} />
                  <InlineStat label="Median" value={fmt(values.percentile50)} />
                  <InlineStat label="P25–P75" value={formatRange(fmt(values.percentile25), fmt(values.percentile75))} />
                  <InlineStat label="P1–P99" value={formatRange(fmt(values.percentile1), fmt(values.percentile99))} />
                </Inline>
              </>
            ) : (
              <EmptyState variant="inline" title="No data" className="flex h-80 items-center justify-center py-0" />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
