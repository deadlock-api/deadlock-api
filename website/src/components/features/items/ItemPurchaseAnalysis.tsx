import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";

import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import { ItemSelectorMultiple } from "~/components/domain/selectors/ItemSelector";
import type { MatchMode } from "~/components/domain/selectors/MatchModeSelector";
import { ItemBuyTimingChart } from "~/components/features/items/ItemBuyTimingChart";
import { ChartToolbar } from "~/components/patterns/charts/ChartToolbar";
import { Field } from "~/components/ui/field";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
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
        <ChartToolbar title="Purchase analysis" label="Purchase analysis controls">
          <Field label="Items" orientation="horizontal">
            <ItemSelectorMultiple value={Array.from(itemIds)} onValueChange={(i) => setItemIds(new Set(i))} />
          </Field>
        </ChartToolbar>
        <ItemBuyTimingChart itemIds={Array.from(itemIds)} baseQueryOptions={queryStatOptions} />
      </div>
    </div>
  );
}
