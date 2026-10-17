import { ShoppingBag } from "lucide-react";
import { useMemo } from "react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { type BuildRow, buildItemPresence } from "~/lib/build-stats";
import { formatShare, formatSignedPercent } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";

const ITEMS_SHOWN = 15;
/** Where the win rate bar reaches its edge: ten points either way. */
const CHANGE_SCALE = 0.1;

/**
 * The items the played builds list most, weighted by how often each build was played, and how the builds that list an
 * item won against the builds that do not.
 */
export function BuildItemsPanel({
  rows,
  pending,
  className,
}: {
  rows: readonly BuildRow[];
  /** Build contents are still loading. */
  pending: boolean;
  className?: string;
}) {
  const items = useMemo(() => buildItemPresence(rows).slice(0, ITEMS_SHOWN), [rows]);
  return (
    <Panel className={cn("flex flex-col", className)}>
      <PanelHeader title="Items in played builds" icon={ShoppingBag} size="sm" />
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {pending ? (
          <LoadingState variant="skeleton" size="sm" />
        ) : items.length === 0 ? (
          <EmptyState variant="plain" title="No build contents" />
        ) : (
          <RankedEntityList density="compact" columns="single">
            {items.map((item, index) => (
              <RankedEntityRow
                key={item.itemId}
                rank={index + 1}
                entity={{ itemId: item.itemId }}
                meta={`${item.builds} ${item.builds === 1 ? "build" : "builds"}`}
              >
                <RankedEntityMetric
                  label="Played"
                  labelDisplay={index === 0 ? "visible" : "hidden"}
                  value={formatShare(item.share)}
                  share={item.share}
                />
                <RankedEntityMetric
                  label="Win diff"
                  labelDisplay={index === 0 ? "visible" : "hidden"}
                  value={item.vsWithout === null ? null : formatSignedPercent(item.vsWithout)}
                  tone={item.vsWithout === null ? undefined : toneOf(Math.round(item.vsWithout * 1000))}
                  change={{ value: item.vsWithout, scale: CHANGE_SCALE }}
                />
              </RankedEntityRow>
            ))}
          </RankedEntityList>
        )}
      </div>
    </Panel>
  );
}
