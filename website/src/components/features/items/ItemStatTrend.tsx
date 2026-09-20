import { lazy, type ComponentProps } from "react";

import { StatTrendHoverCard } from "~/components/patterns/charts/StatTrendHoverCard";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";

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
    <StatTrendHoverCard
      triggerDisplay="block"
      trigger={
        <>
          <span className="sr-only">{`${itemName} ${ITEM_TABLE_TRENDS[stat].label} over time`}</span>
          <ProgressBarWithLabel {...progressProps} />
        </>
      }
    >
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
    </StatTrendHoverCard>
  );
}
