import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";
import ItemBuyTimingChart from "~/components/items-page/ItemBuyTimingChart";
import { ItemSelectorMultiple } from "~/components/selectors/ItemSelector";
import type { Dayjs } from "~/dayjs";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import type { ItemStatsQueryParams } from "~/queries/item-stats-query";

export default function ItemPurchaseAnalysis({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
  minMatches,
  minBoughtAtS,
  maxBoughtAtS,
}: {
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  minMatches?: number | null;
  minBoughtAtS?: number;
  maxBoughtAtS?: number;
}) {
  const [itemIds, setItemIds] = useQueryState("item_ids", parseAsSetOf(parseAsInteger).withDefault(new Set()));
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
      minBoughtAtS,
      maxBoughtAtS,
    } satisfies ItemStatsQueryParams;
  }, [minMatches, hero, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, minBoughtAtS, maxBoughtAtS]);

  return (
    <div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap justify-center sm:flex-nowrap gap-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Items</span>
            <ItemSelectorMultiple onItemsSelected={(i) => setItemIds(new Set(i))} selectedItems={Array.from(itemIds)} />
          </div>
        </div>
        <ItemBuyTimingChart itemIds={Array.from(itemIds)} baseQueryOptions={queryStatOptions} />
      </div>
    </div>
  );
}
