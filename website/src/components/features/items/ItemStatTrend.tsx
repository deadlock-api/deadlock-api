import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";

import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
import { ITEM_TABLE_TRENDS } from "~/lib/item-table-trends";

import type { ItemStatTrendChartProps } from "./ItemStatTrendChart";

const ItemStatTrendChart = lazy(() => import("./ItemStatTrendChart"));

type ItemTrendProps = ItemStatTrendChartProps & { itemName: string };

/**
 * A table value with the item's trend of that stat in a hover card. `block` holds a bar that fills its column; a plain
 * value sits inline with the dashed underline that marks a hover card behind it.
 */
export function ItemTrendValue({
  params,
  itemId,
  itemName,
  stat,
  display = "inline-block",
  children,
}: ItemTrendProps & { display?: "block" | "inline-block"; children: ReactNode }) {
  return (
    <Tooltip
      variant="preview"
      side="bottom"
      align="end"
      content={
        <Suspense fallback={<LoadingState label="trend" className="flex h-62.5 items-center justify-center" />}>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">{itemName}</p>
            <ItemStatTrendChart params={params} itemId={itemId} stat={stat} />
          </div>
        </Suspense>
      }
    >
      <TooltipTarget display={display} underline={display === "block" ? "none" : "dashed"}>
        <span className="sr-only">{`${itemName} ${ITEM_TABLE_TRENDS[stat].label} over time`}</span>
        {children}
      </TooltipTarget>
    </Tooltip>
  );
}

/** A rate bar with the item's trend of that rate in a hover card. */
export function ItemStatTrend({
  params,
  itemId,
  itemName,
  stat,
  ...progressProps
}: ItemTrendProps & Omit<ComponentProps<typeof ProgressBarWithLabel>, "tooltip">) {
  return (
    <ItemTrendValue params={params} itemId={itemId} itemName={itemName} stat={stat} display="block">
      <ProgressBarWithLabel {...progressProps} />
    </ItemTrendValue>
  );
}
