import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import ItemImage from "~/components/ItemImage";
import ItemName from "~/components/ItemName";
import ItemBuyTimingChart from "~/components/items-page/ItemBuyTimingChart";
import { getDisplayItemStats, ItemStatsTableDisplay } from "~/components/items-page/ItemStatsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Dayjs } from "~/dayjs";
import { serializers, useQSSet, useQSString } from "~/hooks/useQSState";
import { ASSETS_ORIGIN } from "~/lib/constants";
import { type ItemStatsQueryParams, itemStatsQueryOptions } from "~/queries/item-stats-query";
import type { APIItemStats } from "~/types/api_item_stats";
import type { AssetsItem } from "~/types/assets_item";
import { Button } from "../ui/button";

export default function ItemCombsExplore({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  sortBy,
  hero,
  minMatches,
  limit,
}: {
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  sortBy?: keyof APIItemStats | "winrate";
  minMatches?: number | null;
  limit?: number;
}) {
  const [includeItems, setIncludeItems] = useQSSet("include_items", serializers.number, new Set());
  const [excludeItems, setExcludeItems] = useQSSet("exclude_items", serializers.number, new Set());
  const [slot, setSlot] = useQSString<"weapon" | "vitality" | "spirit">("item_slot", "weapon");

  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: assetsItems, isLoading: isLoadingItemAssets } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch(new URL("/v2/items/by-type/upgrade", ASSETS_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const queryStatOptions = useMemo(() => {
    return {
      minMatches,
      hero,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      includeItems,
      excludeItems,
      bucket: undefined,
    } satisfies ItemStatsQueryParams;
  }, [minMatches, hero, minRankId, maxRankId, minDateTimestamp, maxDateTimestamp, includeItems, excludeItems]);

  const { data = [], isLoading: isLoadingItemStats } = useQuery(itemStatsQueryOptions(queryStatOptions));

  const minWinRate = useMemo(() => Math.min(...data.map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...data.map((item) => item.wins / item.matches)), [data]);
  const minUsage = useMemo(() => Math.min(...data.map((item) => item.matches)), [data]);
  const maxUsage = useMemo(() => Math.max(...data.map((item) => item.matches)), [data]);
  const filteredData = useMemo(
    () =>
      data?.filter((d) =>
        assetsItems
          ?.filter((i) => !i.disabled && i.shop_image_small_webp)
          .map((i) => i.id)
          .includes(d.item_id),
      ),
    [data, assetsItems],
  );

  const sortedData = useMemo(
    () =>
      sortBy
        ? [...(filteredData || [])].sort((a, b) => {
            const a_score = sortBy !== "winrate" ? a[sortBy] : a.wins / a.matches;
            const b_score = sortBy !== "winrate" ? b[sortBy] : b.wins / b.matches;
            return (b_score || 0) - (a_score || 0);
          })
        : filteredData,
    [filteredData, sortBy],
  );

  const limitedData = useMemo(() => (limit ? sortedData?.slice(0, limit) : sortedData), [sortedData, limit]);
  const displayData = useMemo(() => getDisplayItemStats(limitedData, assetsItems || []), [limitedData, assetsItems]);

  if (isLoadingItemAssets) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 text-center mt-2 rounded bg-gray-800 p-4 min-h-24">
        <div className="border-r-1">
          <h2 className="text-center text-xl p-2">Included Items</h2>
          <div className="flex flex-wrap items-center justify-center p-2 gap-2">
            {Array.from(includeItems)?.map((item) => (
              <Button
                key={item}
                variant="outline"
                onClick={() => setIncludeItems(new Set([...includeItems].filter((i) => i !== item)))}
              >
                <div className="flex items-center justify-start w-full gap-2">
                  <ItemImage itemId={item} className="size-6" />
                  <ItemName itemId={item} className="text-sm text-pretty" />
                </div>
              </Button>
            ))}
          </div>
        </div>
        <div className="border-l-1">
          <h2 className="text-center text-xl p-2">Excluded Items</h2>
          <div className="flex flex-wrap items-center justify-center p-2 gap-2">
            {Array.from(excludeItems)?.map((item) => (
              <Button
                key={item}
                variant="outline"
                onClick={() => setExcludeItems(new Set([...excludeItems].filter((i) => i !== item)))}
              >
                <div className="flex items-center justify-start w-full gap-2">
                  <ItemImage itemId={item} className="size-6" />
                  <ItemName itemId={item} className="text-sm text-pretty" />
                </div>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded bg-gray-800 px-4 py-2">
        <h2 className="text-center text-xl p-2">Select Items</h2>
        <Tabs value={slot} onValueChange={(i) => setSlot(i as "weapon" | "vitality" | "spirit")} className="w-full">
          <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
            <TabsTrigger value="weapon">Weapon</TabsTrigger>
            <TabsTrigger value="vitality">Vitality</TabsTrigger>
            <TabsTrigger value="spirit">Spirit</TabsTrigger>
          </TabsList>
          <TabsContent value={slot}>
            {[1, 2, 3, 4].map((tier) => (
              <div key={tier}>
                <h3 className="text-center text-lg p-2 mt-2">Tier {tier}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-2">
                  {assetsItems
                    ?.filter(
                      (i) =>
                        !i.disabled && i.shop_image_small_webp && i.item_slot_type === slot && i.item_tier === tier,
                    )
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2">
                          <ItemImage itemId={item.id} className="size-8 min-w-8 min-h-8" />
                          <ItemName itemId={item.id} className="text-sm text-pretty" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            className="bg-green-700 hover:bg-green-500 text-lg px-1 h-6"
                            onClick={() => {
                              setIncludeItems(new Set([...includeItems, item.id]));
                              if (excludeItems.has(item.id)) {
                                setExcludeItems(new Set([...excludeItems].filter((i) => i !== item.id)));
                              }
                            }}
                          >
                            <span className="icon-[mdi--plus]" />
                          </Button>
                          <Button
                            variant="destructive"
                            className="bg-red-700 hover:bg-red-500 px-1 h-6"
                            onClick={() => {
                              setExcludeItems(new Set([...excludeItems, item.id]));
                              if (includeItems.has(item.id)) {
                                setIncludeItems(new Set([...includeItems].filter((i) => i !== item.id)));
                              }
                            }}
                          >
                            <span className="icon-[mdi--minus] text-lg" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* Display the filtered data using ItemStatsTableDisplay */}
      <div className="mt-4 rounded bg-gray-800 p-4">
        <h2 className="text-center text-xl p-2">Items Stats</h2>
        <ItemStatsTableDisplay
          data={displayData}
          isLoading={isLoadingItemStats || isLoadingItemAssets}
          columns={["winRate", "usage", "itemsTier", "confidence"]}
          hideHeader={false}
          hideIndex={true}
          hideItemTierFilter={false}
          minWinRate={minWinRate}
          maxWinRate={maxWinRate}
          minUsage={minUsage}
          maxUsage={maxUsage}
          includedItemIds={Array.from(includeItems)}
          excludedItemIds={Array.from(excludeItems)}
          onItemInclude={(i) => setIncludeItems(new Set([...includeItems, i]))}
          onItemExclude={(i) => setExcludeItems(new Set([...excludeItems, i]))}
          customDropdownContent={({ itemId, rowTotal }) => (
            <ItemBuyTimingChart itemIds={[itemId]} baseQueryOptions={queryStatOptions} rowTotalMatches={rowTotal} />
          )}
        />
      </div>
    </div>
  );
}
