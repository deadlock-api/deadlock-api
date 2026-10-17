import { ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { type BuildRow, buildItemPresence, distinguishingItems } from "~/lib/build-stats";
import { formatShare, formatSignedPercent } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";

const ITEMS_SHOWN = 15;
/** Where the win rate bar reaches its edge: ten points either way. */
const CHANGE_SCALE = 0.1;

/**
 * The items some played builds list and others leave out, with how often a build that lists the item was played and
 * how those builds won against the builds without it: the best difference first, or with `Worst` the worst.
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
  const [side, setSide] = useState<"best" | "worst">("best");
  const ranked = useMemo(() => distinguishingItems(buildItemPresence(rows)), [rows]);
  const items = (
    side === "best"
      ? ranked.filter((item) => item.vsWithout! > 0)
      : ranked.filter((item) => item.vsWithout! < 0).reverse()
  ).slice(0, ITEMS_SHOWN);
  return (
    <Panel className={cn("flex flex-col", className)}>
      <PanelHeader title="Items that set builds apart" icon={ShoppingBag} size="sm">
        <Segmented
          size="sm"
          width="hug"
          value={side}
          onValueChange={setSide}
          aria-label="Items whose builds won more or less"
          className="ms-auto"
        >
          <SegmentedItem value="best">Best</SegmentedItem>
          <SegmentedItem value="worst">Worst</SegmentedItem>
        </Segmented>
      </PanelHeader>
      <div className={cn(SCROLLBAR_THIN, "relative min-h-0 flex-1 overflow-y-auto px-3")}>
        {pending ? (
          <LoadingState variant="skeleton" size="sm" />
        ) : items.length === 0 ? (
          <EmptyState
            variant="plain"
            title={side === "best" ? "No item comes with better builds" : "No item comes with worse builds"}
          />
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
