import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";

import { ItemBuyTimingChart } from "~/components/items-page/ItemBuyTimingChart";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { ItemSelectorMultiple } from "~/components/selectors/ItemSelector";
import type { Dayjs } from "~/dayjs";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client/api";

export function ItemPurchaseAnalysis({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
  minMatches,
  minBoughtAtS,
  maxBoughtAtS,
  gameMode,
}: {
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  minMatches?: number | null;
  minBoughtAtS?: number;
  maxBoughtAtS?: number;
  gameMode?: GameMode;
}) {
  const [itemIds, setItemIds] = useQueryState("item_ids", parseAsSetOf(parseAsInteger).withDefault(new Set()));
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const queryStatOptions: Omit<AnalyticsApiItemStatsRequest, "bucket"> = useMemo(() => ({
    minMatches,
    heroId: hero,
    minAverageBadge: minRankId ?? 0,
    maxAverageBadge: maxRankId ?? 116,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
    minBoughtAtS,
    maxBoughtAtS,
    gameMode,
  }), [
    minMatches,
    hero,
    minRankId,
    maxRankId,
    minDateTimestamp,
    maxDateTimestamp,
    minBoughtAtS,
    maxBoughtAtS,
    gameMode,
  ]);

  return (
    <div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap justify-center gap-2 sm:flex-nowrap">
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
