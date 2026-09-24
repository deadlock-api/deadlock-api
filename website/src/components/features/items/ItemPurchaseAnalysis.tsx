import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { ChartNoAxesCombined } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";

import { ItemSelector } from "~/components/domain/selectors/ItemSelector";
import { ItemBuyTimingChart } from "~/components/features/items/ItemBuyTimingChart";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { parseAsSetOf } from "~/lib/nuqs-parsers";

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
  matchMode,
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
  matchMode?: MatchMode;
}) {
  const [itemIds, setItemIds] = useQueryState("item_ids", parseAsSetOf(parseAsInteger).withDefault(new Set()));
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const queryStatOptions: Omit<AnalyticsApiItemStatsRequest, "bucket"> = useMemo(
    () => ({
      minMatches,
      heroId: hero,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
      matchMode,
    }),
    [
      minMatches,
      hero,
      minRankId,
      maxRankId,
      minUnixTimestamp,
      maxUnixTimestamp,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
      matchMode,
    ],
  );

  return (
    <div>
      <div className="flex flex-col gap-4">
        <FilterBar
          variant="toolbar"
          title="Purchase analysis"
          icon={ChartNoAxesCombined}
          aria-label="Purchase analysis controls"
        >
          <ItemSelector
            selection="multiple"
            size="sm"
            emptyLabel="None"
            value={Array.from(itemIds)}
            onValueChange={(ids) => setItemIds(new Set(ids))}
          />
        </FilterBar>
        <ItemBuyTimingChart itemIds={Array.from(itemIds)} baseQueryOptions={queryStatOptions} />
      </div>
    </div>
  );
}
