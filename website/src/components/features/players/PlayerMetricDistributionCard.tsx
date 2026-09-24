import type { HashMapValue } from "deadlock_api_client";
import { Maximize2 } from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { formatPlayerMetricValue, type PlayerMetricDefinition } from "~/lib/player-metrics";

import { buildDistributionCurve, DistributionChart } from "./distribution-chart";

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
    <Card tone="inset" size="xs" className="gap-1.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-foreground">{def.label}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">{values ? fmt(values.avg) : "-"}</span>
          {hasData && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onExpand}
              aria-label={`Expand ${def.label} distribution`}
              className="text-muted-foreground"
            >
              <Maximize2 />
            </Button>
          )}
        </div>
      </div>

      {!hasData || !values ? (
        <EmptyState variant="inline" title="No data" className="flex h-32 items-center justify-center py-0 text-xs" />
      ) : (
        <DistributionChart label={def.label} curve={curve} values={values} fmt={fmt} height={130} />
      )}
    </Card>
  );
}
