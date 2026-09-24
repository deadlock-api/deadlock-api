import type { HashMapValue } from "deadlock_api_client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { InlineStat } from "~/components/ui/inline-stat";
import { Inline } from "~/components/ui/stack";
import { formatPlayerMetricValue, type PlayerMetricDefinition } from "~/lib/player-metrics";

import { buildDistributionCurve, DistributionChart } from "./distribution-chart";

export function PlayerMetricDistributionDialog({
  metric,
  values,
  onClose,
  onPrev,
  onNext,
}: {
  metric: PlayerMetricDefinition | null;
  values: HashMapValue | undefined;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const fmt = (v: number) => (metric ? formatPlayerMetricValue(v, metric.format) : String(v));
  const curve = useMemo(() => (values ? buildDistributionCurve(values) : []), [values]);

  return (
    <Dialog open={metric != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onPrev();
          else if (e.key === "ArrowRight") onNext();
        }}
      >
        {metric && (
          <>
            <DialogHeader>
              <DialogTitle>{metric.label} distribution</DialogTitle>
            </DialogHeader>

            <Button
              variant="secondary"
              size="icon"
              shape="pill"
              onClick={onPrev}
              aria-label="Previous metric"
              className="absolute start-2 top-1/2 z-10 -translate-y-1/2"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              shape="pill"
              onClick={onNext}
              aria-label="Next metric"
              className="absolute end-2 top-1/2 z-10 -translate-y-1/2"
            >
              <ChevronRight className="size-5" />
            </Button>

            {values && curve.length >= 3 ? (
              <>
                <DistributionChart label={metric.label} curve={curve} values={values} fmt={fmt} height={440} />
                <Inline justify="center" gap={6} className="gap-y-1 text-xs">
                  <InlineStat label="Average" value={fmt(values.avg)} />
                  <InlineStat label="Median" value={fmt(values.percentile50)} />
                  <InlineStat label="P25-P75" value={`${fmt(values.percentile25)} - ${fmt(values.percentile75)}`} />
                  <InlineStat label="P1-P99" value={`${fmt(values.percentile1)} - ${fmt(values.percentile99)}`} />
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
