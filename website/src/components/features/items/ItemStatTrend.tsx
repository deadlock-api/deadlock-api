import { lazy, Suspense, type ComponentProps } from "react";

import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";

import { ITEM_TABLE_TRENDS, type ItemStatTrendChartProps } from "./ItemStatTrendChart";

const ItemStatTrendChart = lazy(() => import("./ItemStatTrendChart"));

export function ItemStatTrend({
  params,
  itemId,
  itemName,
  stat,
  bucket,
  onBucketChange,
  ...progressProps
}: ItemStatTrendChartProps & Omit<ComponentProps<typeof ProgressBarWithLabel>, "tooltip"> & { itemName: string }) {
  return (
    <Tooltip
      variant="preview"
      side="bottom"
      align="end"
      content={
        <Suspense fallback={<LoadingState label="trend" className="flex h-62.5 items-center justify-center" />}>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">{itemName}</p>
            <ItemStatTrendChart
              params={params}
              itemId={itemId}
              stat={stat}
              bucket={bucket}
              onBucketChange={onBucketChange}
            />
          </div>
        </Suspense>
      }
    >
      <TooltipTarget display="block">
        <span className="sr-only">{`${itemName} ${ITEM_TABLE_TRENDS[stat].label} over time`}</span>
        <ProgressBarWithLabel {...progressProps} />
      </TooltipTarget>
    </Tooltip>
  );
}
