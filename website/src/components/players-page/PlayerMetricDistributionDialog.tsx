import type { HashMapValue } from "deadlock_api_client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";

import { buildDistributionCurve, DistributionChart } from "./distribution-chart";
import { formatPlayerMetricValue, type PlayerMetricDefinition } from "./player-metric-definitions";

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

            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous metric"
              className="absolute top-1/2 left-2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-muted/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next metric"
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-muted/70 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-5" />
            </button>

            {values && curve.length >= 3 ? (
              <>
                <DistributionChart curve={curve} values={values} fmt={fmt} height={440} />
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Average <span className="font-medium text-foreground">{fmt(values.avg)}</span>
                  </span>
                  <span>
                    Median <span className="font-medium text-foreground">{fmt(values.percentile50)}</span>
                  </span>
                  <span>
                    P25-P75{" "}
                    <span className="font-medium text-foreground">
                      {fmt(values.percentile25)} - {fmt(values.percentile75)}
                    </span>
                  </span>
                  <span>
                    P1-P99{" "}
                    <span className="font-medium text-foreground">
                      {fmt(values.percentile1)} - {fmt(values.percentile99)}
                    </span>
                  </span>
                </div>
              </>
            ) : (
              <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">No data</div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
