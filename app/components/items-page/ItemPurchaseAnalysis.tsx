import * as React from "react";
import { useMemo } from "react";
import ItemBuyTimingChart from "~/components/items-page/ItemBuyTimingChart";
import { ItemSelectorMultiple } from "~/components/selectors/ItemSelector";
import type { Dayjs } from "~/dayjs";
import { serializers, useQSSet } from "~/hooks/useQSState";
import type { ItemStatsQueryParams } from "~/queries/item-stats-query";

export default function ItemPurchaseAnalysis({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
  minMatches,
}: {
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  minMatches?: number | null;
}) {
  const [itemIds, setItemIds] = useQSSet("item_ids", serializers.number, new Set());
  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const queryStatOptions = useMemo(() => {
    return {
      minMatches,
      hero,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      bucket: undefined,
    } satisfies ItemStatsQueryParams;
  }, [minMatches, hero, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp]);

  return (
    <div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Items</span>
            <ItemSelectorMultiple
              onItemesSelected={(i) => setItemIds(new Set(i))}
              selectedItemes={Array.from(itemIds)}
            />
          </div>
        </div>
        <ItemBuyTimingChart itemIds={Array.from(itemIds)} baseQueryOptions={queryStatOptions} />
      </div>
    </div>
  );
}
