import { useQuery } from "@tanstack/react-query";
import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import * as React from "react";
import ItemImage from "~/components/ItemImage";
import ItemName from "~/components/ItemName";
import { ItemStatsTableDisplay } from "~/components/items-page/ItemStatsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
  limit,
}: {
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  sortBy?: keyof APIItemStats | "winrate";
  limit?: number;
}) {
  const [includeItems, setIncludeItems] = useState<Set<number>>(new Set());
  const [excludeItems, setExcludeItems] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"weapon" | "vitality" | "spirit">("weapon");

  const minDateTimestamp = useMemo(() => minDate?.unix(), [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: assetsItems, isLoading: isLoadingItemAssets } = useQuery<AssetsItem[]>({
    queryKey: ["assets-items-upgrades"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/items/by-type/upgrade").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { data, isLoading: isLoadingItemStats } = useQuery<APIItemStats[]>({
    queryKey: [
      "api-item-stats",
      hero,
      minRankId,
      maxRankId,
      minDateTimestamp,
      maxDateTimestamp,
      Array.from(includeItems),
      Array.from(excludeItems),
    ],
    queryFn: async () => {
      const url = new URL("https://api.deadlock-api.com/v1/analytics/item-stats");
      if (hero) url.searchParams.set("hero_id", hero.toString());
      url.searchParams.set("min_average_badge", (minRankId ?? 0).toString());
      url.searchParams.set("max_average_badge", (maxRankId ?? 116).toString());
      if (includeItems.size > 0) url.searchParams.set("include_item_ids", Array.from(includeItems).join(","));
      if (excludeItems.size > 0) url.searchParams.set("exclude_item_ids", Array.from(excludeItems).join(","));
      if (minDateTimestamp) url.searchParams.set("min_unix_timestamp", minDateTimestamp.toString());
      if (maxDateTimestamp) url.searchParams.set("max_unix_timestamp", maxDateTimestamp.toString());
      const res = await fetch(url);
      return await res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const minWinRate = useMemo(() => Math.min(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...(data || []).map((item) => item.wins / item.matches)), [data]);
  const minMatches = useMemo(() => Math.min(...(data || []).map((item) => item.matches)), [data]);
  const maxMatches = useMemo(() => Math.max(...(data || []).map((item) => item.matches)), [data]);
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
            return b_score - a_score;
          })
        : filteredData,
    [filteredData, sortBy],
  );

  const limitedData = useMemo(() => (limit ? sortedData?.slice(0, limit) : sortedData), [sortedData, limit]);

  if (isLoadingItemAssets) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 text-center mt-4 rounded bg-gray-800 p-4 min-h-32">
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
                  <ItemName itemId={item} />
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
                  <ItemName itemId={item} />
                </div>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded bg-gray-800 p-4">
        <h2 className="text-center text-xl p-2">Select Items</h2>
        <Tabs value={tab} onValueChange={(i) => setTab(i as "weapon" | "vitality" | "spirit")} className="w-full">
          <TabsList className="flex items-center justify-start flex-wrap h-auto w-full">
            <TabsTrigger value="weapon">Weapon</TabsTrigger>
            <TabsTrigger value="vitality">Vitality</TabsTrigger>
            <TabsTrigger value="spirit">Spirit</TabsTrigger>
          </TabsList>
          <TabsContent value={tab}>
            {[1, 2, 3, 4].map((tier) => (
              <div key={tier}>
                <h3 className="text-center text-lg p-2 mt-4">Tier {tier}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2">
                  {assetsItems
                    ?.filter(
                      (i) => !i.disabled && i.shop_image_small_webp && i.item_slot_type === tab && i.item_tier === tier,
                    )
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2">
                          <ItemImage itemId={item.id} className="size-10" />
                          <ItemName itemId={item.id} className="text-md" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            className="bg-green-700 hover:bg-green-500 text-lg p-2"
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
                            className="bg-red-700 hover:bg-red-500 p-2"
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
          data={limitedData}
          isLoading={isLoadingItemStats || isLoadingItemAssets}
          columns={["winRate", "usage", "itemsTier"]}
          hideHeader={false}
          hideIndex={true}
          minWinRate={minWinRate}
          maxWinRate={maxWinRate}
          minMatches={minMatches}
          maxMatches={maxMatches}
          onItemInclude={(i) => setIncludeItems(new Set([...includeItems, i]))}
          onItemExclude={(i) => setExcludeItems(new Set([...excludeItems, i]))}
        />
      </div>
    </div>
  );
}
