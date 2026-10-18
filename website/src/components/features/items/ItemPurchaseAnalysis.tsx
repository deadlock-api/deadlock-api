import type { AnalyticsApiItemStatsRequest } from "deadlock_api_client";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";

import { ItemSelector } from "~/components/domain/selectors/ItemSelector";
import { ItemBuyTimingChart } from "~/components/features/items/ItemBuyTimingChart";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { enemyHeroFilter } from "~/lib/enemy-heroes";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { parseAsSetOf } from "~/lib/nuqs-parsers";

const NO_ENEMIES: readonly number[] = [];

export function ItemPurchaseAnalysis({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  hero,
  enemies = NO_ENEMIES,
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
  /** Only matches with these heroes on the other team: which items win against them. */
  enemies?: readonly number[];
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
      ...enemyHeroFilter(enemies),
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
      enemies,
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
    // The item picker sits in the chart's own header, beside what it changes.
    <ItemBuyTimingChart
      itemIds={Array.from(itemIds)}
      baseQueryOptions={queryStatOptions}
      itemPicker={
        <ItemSelector
          selection="multiple"
          size="sm"
          emptyLabel="None"
          value={Array.from(itemIds)}
          onValueChange={(ids) => setItemIds(new Set(ids))}
        />
      }
    />
  );
}
