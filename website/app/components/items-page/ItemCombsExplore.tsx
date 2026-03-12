import { useQuery } from "@tanstack/react-query";
import type { AbilityV2, HeroV2 } from "assets_deadlock_api_client/api";
import type { ItemStats } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";

import { ItemImage } from "~/components/ItemImage";
import { ItemName } from "~/components/ItemName";
import { ItemBuyTimingChart } from "~/components/items-page/ItemBuyTimingChart";
import { getDisplayItemStats, ItemStatsTableDisplay } from "~/components/items-page/ItemStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import MatchHistoryCard, { type FullBuildItem } from "~/components/MatchHistoryCard";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day, type Dayjs } from "~/dayjs";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import type { AnalyticsApiItemStatsRequest, MatchesApiBulkMetadataRequest } from "deadlock_api_client/api";
import { api } from "~/lib/api";

import { cn } from "~/lib/utils";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { Button } from "../ui/button";

interface BulkMatchMetadata {
  match_id: number;
  start_time: string;
  duration_s: number;
  winning_team: string;
  match_mode: string;
  game_mode: string;
  average_badge_team0: number | null;
  average_badge_team1: number | null;
  players: {
    account_id: number;
    hero_id: number;
    team: string;
    kills: number;
    deaths: number;
    assists: number;
    items: {
      item_id: number;
      upgrade_id: number;
      game_time_s: number;
      sold_time_s: number;
      imbued_ability_id: number;
    }[];
  }[];
}

const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

function getHeroAbilityMetadata(heroData?: HeroV2, abilityItems?: AbilityV2[]) {
  if (!heroData || !abilityItems) return null;

  const abilityEntries = HERO_ABILITY_SLOTS.map((slot, index) => {
    const className = heroData.items?.[slot];
    if (!className) return null;

    const ability = abilityItems.find((item) => item.class_name === className);
    if (!ability) return null;

    return {
      abilityId: ability.id,
      slot: index + 1,
      maxLevel: (ability.upgrades?.length ?? 0) + 1,
    };
  }).filter((entry): entry is { abilityId: number; slot: number; maxLevel: number } => entry != null);

  if (abilityEntries.length === 0) return null;

  return {
    abilityIdToSlot: new Map(abilityEntries.map(({ abilityId, slot }) => [abilityId, slot])),
    abilityIdToMaxLevel: new Map(abilityEntries.map(({ abilityId, maxLevel }) => [abilityId, maxLevel])),
  };
}

function getAbilityBuildData(
  items: BulkMatchMetadata["players"][number]["items"],
  abilityIdToSlot?: Map<number, number>,
  abilityIdToMaxLevel?: Map<number, number>,
) {
  if (!abilityIdToSlot || !abilityIdToMaxLevel) return undefined;

  const abilities = Array.from(abilityIdToSlot.entries()).map(([abilityId, slot]) => ({
    abilityId,
    slot,
    level: 0,
    maxLevel: abilityIdToMaxLevel.get(abilityId) ?? 1,
    maxedAt: undefined as number | undefined,
    lastUpgradeAt: undefined as number | undefined,
  }));

  const abilitiesById = new Map(abilities.map((ability) => [ability.abilityId, ability]));
  const abilityUpgradeSequence: number[] = [];

  for (const item of [...items].sort((a, b) => a.game_time_s - b.game_time_s)) {
    const ability = abilitiesById.get(item.item_id);
    if (!ability || ability.level >= ability.maxLevel) continue;

    ability.level += 1;
    ability.lastUpgradeAt = item.game_time_s;
    abilityUpgradeSequence.push(ability.slot);

    if (ability.level === ability.maxLevel && ability.maxedAt == null) {
      ability.maxedAt = item.game_time_s;
    }
  }

  const abilityBuildOrder = [...abilities]
    .sort((a, b) => {
      if (a.maxedAt != null && b.maxedAt != null) {
        return a.maxedAt - b.maxedAt || a.slot - b.slot;
      }
      if (a.maxedAt != null) return -1;
      if (b.maxedAt != null) return 1;
      return b.level - a.level || (b.lastUpgradeAt ?? -1) - (a.lastUpgradeAt ?? -1) || a.slot - b.slot;
    })
    .map((ability) => ability.slot);

  return {
    abilityBuildOrder,
    abilityUpgradeSequence,
  };
}

function timeAgo(dateStr: string): string {
  return day(`${dateStr}Z`).fromNow();
}

export function ItemCombsExplore({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  sortBy,
  hero,
  minMatches,
  limit,
  minBoughtAtS,
  maxBoughtAtS,
  gameMode,
}: {
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  hero?: number | null;
  sortBy?: keyof ItemStats | "winrate";
  minMatches?: number | null;
  limit?: number;
  minBoughtAtS?: number;
  maxBoughtAtS?: number;
  gameMode?: GameMode;
}) {
  const [includeItems, setIncludeItems] = useQueryState(
    "include_items",
    parseAsSetOf(parseAsInteger).withDefault(new Set()),
  );
  const [excludeItems, setExcludeItems] = useQueryState(
    "exclude_items",
    parseAsSetOf(parseAsInteger).withDefault(new Set()),
  );
  const [slot, setSlot] = useQueryState(
    "item_slot",
    parseAsStringLiteral(["weapon", "vitality", "spirit"] as const).withDefault("weapon"),
  );

  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const { data: assetsItems, isLoading: isLoadingItemAssets } = useQuery(itemUpgradesQueryOptions);

  const { data: heroesData } = useQuery(heroesQueryOptions);

  const { data: abilityItems } = useQuery(abilitiesQueryOptions);

  const { data: ranksData } = useQuery(ranksQueryOptions);

  const queryStatOptions: AnalyticsApiItemStatsRequest = useMemo(() => ({
    minMatches,
    heroId: hero,
    minAverageBadge: minRankId ?? 0,
    maxAverageBadge: maxRankId ?? 116,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
    includeItemIds: includeItems ? Array.from(includeItems) : undefined,
    excludeItemIds: excludeItems ? Array.from(excludeItems) : undefined,
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
    includeItems,
    excludeItems,
    minBoughtAtS,
    maxBoughtAtS,
    gameMode,
  ]);

  const { data = [], isLoading: isLoadingItemStats } = useQuery(itemStatsQueryOptions(queryStatOptions));

  // Build lookup: class_name → item_id, and item_id → set of component class_names
  const upgradeChainLookup = useMemo(() => {
    if (!assetsItems) return null;
    const classNameById = new Map<number, string>();
    const componentsByItemId = new Map<number, string[]>();
    for (const item of assetsItems) {
      classNameById.set(item.id, item.class_name);
      if (item.component_items?.length) {
        componentsByItemId.set(item.id, item.component_items);
      }
    }
    return { classNameById, componentsByItemId };
  }, [assetsItems]);

  const topBuildsEnabled = !!hero && includeItems.size > 0;
  const topBuildsQuery: MatchesApiBulkMetadataRequest = {
    includeInfo: true,
    includePlayerItems: true,
    includePlayerKda: true,
    includePlayerInfo: true,
    heroIds: hero != null ? String(hero) : undefined,
    itemFilterHeroId: hero,
    includeItemIds: Array.from(includeItems).sort().join(","),
    excludeItemIds: excludeItems.size > 0 ? Array.from(excludeItems).sort().join(",") : undefined,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minDateTimestamp,
    maxUnixTimestamp: maxDateTimestamp,
    gameMode: gameMode as MatchesApiBulkMetadataRequest["gameMode"],
    orderBy: "average_badge",
    orderDirection: "desc",
    limit: 10,
  };
  const { data: topBuildsData, isLoading: isLoadingTopBuilds } = useQuery({
    queryKey: queryKeys.analytics.topBuilds(topBuildsQuery),
    queryFn: async () => {
      const response = await api.matches_api.bulkMetadata(topBuildsQuery);
      return response.data as unknown as BulkMatchMetadata[];
    },
    enabled: topBuildsEnabled,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
  });

  const topBuildsCards = useMemo(() => {
    if (!topBuildsData || !hero) return [];
    const heroData = heroesData?.find((currentHero) => currentHero.id === hero);
    const heroAbilityMetadata = getHeroAbilityMetadata(heroData, abilityItems);

    return topBuildsData.flatMap((match) => {
      const player = match.players.find((p) => p.hero_id === hero);
      if (!player) return [];
      const shopItems = player.items.filter((i) => i.upgrade_id === 1);
      const boughtItemIds = new Set(shopItems.map((i) => i.item_id));
      const abilityBuildData = getAbilityBuildData(
        player.items,
        heroAbilityMetadata?.abilityIdToSlot,
        heroAbilityMetadata?.abilityIdToMaxLevel,
      );

      const fullBuildItems: FullBuildItem[] = shopItems
        .sort((a, b) => a.game_time_s - b.game_time_s)
        .map((i) => {
          let sold = i.sold_time_s > 0;
          // Check if this item was upgraded rather than truly sold
          if (sold && upgradeChainLookup) {
            const className = upgradeChainLookup.classNameById.get(i.item_id);
            if (className) {
              for (const [otherId, components] of upgradeChainLookup.componentsByItemId) {
                if (components.includes(className) && boughtItemIds.has(otherId)) {
                  sold = false;
                  break;
                }
              }
            }
          }
          return {
            itemId: i.item_id,
            gameTimeS: i.game_time_s,
            sold,
            imbuedAbilityNumber: heroAbilityMetadata?.abilityIdToSlot.get(i.imbued_ability_id),
          };
        });
      const isWin = player.team === match.winning_team;
      const badge0 = match.average_badge_team0;
      const badge1 = match.average_badge_team1;
      const averageBadge =
        badge0 != null && badge1 != null ? Math.round((badge0 + badge1) / 2) : (badge0 ?? badge1 ?? undefined);
      return [
        {
          matchId: match.match_id,
          gameMode: match.match_mode,
          timeAgo: timeAgo(match.start_time),
          result: (isWin ? "win" : "loss") as "win" | "loss",
          durationSeconds: match.duration_s,
          heroId: hero,
          accountId: player.account_id,
          kills: player.kills,
          deaths: player.deaths,
          assists: player.assists,
          itemIds: [] as number[],
          buildData: {
            items: fullBuildItems,
            abilityBuildOrder: abilityBuildData?.abilityBuildOrder,
            abilityUpgradeSequence: abilityBuildData?.abilityUpgradeSequence,
          },
          averageBadge,
        },
      ];
    });
  }, [topBuildsData, hero, upgradeChainLookup, heroesData, abilityItems]);

  const minWinRate = useMemo(() => Math.min(...data.map((item) => item.wins / item.matches)), [data]);
  const maxWinRate = useMemo(() => Math.max(...data.map((item) => item.wins / item.matches)), [data]);
  const minUsage = useMemo(() => Math.min(...data.map((item) => item.matches)), [data]);
  const maxUsage = useMemo(() => Math.max(...data.map((item) => item.matches)), [data]);
  const filteredData = useMemo(
    () =>
      data?.filter((d) =>
        assetsItems
          ?.filter((i) => !i.disabled && i.shopable && i.shop_image_webp)
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
      <div className="flex h-full w-full items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <div>
      <div className="mt-2 grid min-h-24 grid-cols-2 rounded bg-muted p-4 text-center">
        <div className="border-r">
          <h2 className="p-2 text-center text-xl">Included Items</h2>
          <div className="flex flex-wrap items-center justify-center gap-2 p-2">
            {Array.from(includeItems)?.map((item) => (
              <Button
                key={item}
                variant="outline"
                onClick={() => setIncludeItems(new Set([...includeItems].filter((i) => i !== item)))}
              >
                <div className="flex w-full items-center justify-start gap-2">
                  <ItemImage itemId={item} className="size-6" />
                  <ItemName itemId={item} className="text-sm text-pretty" />
                </div>
              </Button>
            ))}
          </div>
        </div>
        <div className="border-l">
          <h2 className="p-2 text-center text-xl">Excluded Items</h2>
          <div className="flex flex-wrap items-center justify-center gap-2 p-2">
            {Array.from(excludeItems)?.map((item) => (
              <Button
                key={item}
                variant="outline"
                onClick={() => setExcludeItems(new Set([...excludeItems].filter((i) => i !== item)))}
              >
                <div className="flex w-full items-center justify-start gap-2">
                  <ItemImage itemId={item} className="size-6" />
                  <ItemName itemId={item} className="text-sm text-pretty" />
                </div>
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded bg-muted px-4 py-2">
        <h2 className="p-2 text-center text-xl">Select Items</h2>
        <Tabs value={slot} onValueChange={(i) => setSlot(i as "weapon" | "vitality" | "spirit")} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap items-center justify-start">
            <TabsTrigger className="flex-1" value="weapon">
              Weapon
            </TabsTrigger>
            <TabsTrigger className="flex-1" value="vitality">
              Vitality
            </TabsTrigger>
            <TabsTrigger className="flex-1" value="spirit">
              Spirit
            </TabsTrigger>
          </TabsList>
          <TabsContent value={slot}>
            {[1, 2, 3, 4].map((tier) => (
              <div key={tier}>
                <h3 className="mt-2 p-2 text-center text-lg">Tier {tier}</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {assetsItems
                    ?.filter(
                      (i) =>
                        !i.disabled &&
                        i.shopable &&
                        i.shop_image_webp &&
                        i.item_slot_type === slot &&
                        i.item_tier === tier,
                    )
                    .map((item) => (
                      <div key={item.id} className="flex w-full items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ItemImage itemId={item.id} className="size-8 min-h-8 min-w-8" />
                          <ItemName itemId={item.id} className="text-sm text-pretty" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            className="h-6 bg-green-700 px-1 text-lg hover:bg-green-500"
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
                            className="h-6 bg-red-700 px-1 hover:bg-red-500"
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

      <div className={cn("mt-4 gap-4", topBuildsEnabled ? "flex" : "")}>
        {/* Display the filtered data using ItemStatsTableDisplay */}
        <div className="min-w-0 flex-1 rounded bg-muted p-4">
          <h2 className="p-2 text-center text-xl">Items Stats</h2>
          <ItemStatsTableDisplay
            data={displayData}
            isLoading={isLoadingItemStats || isLoadingItemAssets}
            columns={["winRate", "matches", "itemsTier", "confidence"]}
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

        {topBuildsEnabled && (
          <div className="w-1/3 shrink-0 overflow-x-auto">
            <h2 className="mb-2 text-center text-lg">Top Builds</h2>
            {isLoadingTopBuilds ? (
              <div className="flex items-center justify-center py-8">
                <LoadingLogo />
              </div>
            ) : topBuildsCards.length > 0 ? (
              <div className="flex flex-col gap-2">
                {topBuildsCards.map((card) => (
                  <MatchHistoryCard key={card.matchId} {...card} ranks={ranksData} expandable={false} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-muted-foreground">No matching builds found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
