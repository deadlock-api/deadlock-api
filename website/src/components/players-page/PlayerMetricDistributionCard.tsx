import type { HashMapValue } from "deadlock_api_client";
import { Maximize2 } from "lucide-react";
import { useMemo } from "react";

import { buildDistributionCurve, DistributionChart } from "./distribution-chart";
import { formatPlayerMetricValue, type PlayerMetricDefinition } from "./player-metric-definitions";

export function PlayerMetricDistributionCard({
  def,
  values,
  onExpand,
}: {
  def: PlayerMetricDefinition;
  values: HashMapValue | undefined;
  onExpand: () => void;
}) {
  const fmt = (v: number) => formatPlayerMetricValue(v, def.format);
  const curve = useMemo(() => (values ? buildDistributionCurve(values) : []), [values]);
  const hasData = values != null && curve.length >= 3;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-foreground">{def.label}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">{values ? fmt(values.avg) : "-"}</span>
          {hasData && (
            <button
              type="button"
              onClick={onExpand}
              aria-label={`Expand ${def.label} distribution`}
              className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <Maximize2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {!hasData || !values ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No data</div>
      ) : (
        <DistributionChart curve={curve} values={values} fmt={fmt} height={130} />
      )}
    </div>
  );
}
