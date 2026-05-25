import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Ability, Hero } from "deadlock_api_client";
import type { ItemStats } from "deadlock_api_client";
import type { AnalyticsApiItemStatsRequest, MatchesApiBulkMetadataRequest } from "deadlock_api_client";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo } from "react";

import { ItemBuyTimingChart } from "~/components/items-page/ItemBuyTimingChart";
import { getDisplayItemStats, ItemStatsTable } from "~/components/items-page/ItemStatsTable";
import { LoadingLogo } from "~/components/LoadingLogo";
import MatchHistoryCard, { type FullBuildItem } from "~/components/MatchHistoryCard";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import { day, type Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";

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

function getHeroAbilityMetadata(heroData?: Hero, abilityItems?: Ability[]) {
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

export function ItemStatsExplorer({
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  prevMinDate,
  prevMaxDate,
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
  prevMinDate?: Dayjs;
  prevMaxDate?: Dayjs;
  hero?: number | null;
  sortBy?: keyof ItemStats | "winrate";
  minMatches?: number | null;
  limit?: number;
  minBoughtAtS?: number;
  maxBoughtAtS?: number;
  gameMode?: GameMode;
}) {
  const [includeItems] = useQueryState("include_items", parseAsSetOf(parseAsInteger).withDefault(new Set()));
  const [excludeItems] = useQueryState("exclude_items", parseAsSetOf(parseAsInteger).withDefault(new Set()));

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { minUnixTimestamp: prevMinTimestamp, maxUnixTimestamp: prevMaxTimestamp } = useNormalizedTimeRange(
    prevMinDate,
    prevMaxDate,
  );
  const hasPreviousInterval = prevMinDate != null && prevMaxDate != null;

  const { data: assetsItems, isLoading: isLoadingItemAssets } = useQuery(itemUpgradesQueryOptions);

  const { data: heroesData } = useQuery(heroesQueryOptions);

  const { data: abilityItems } = useQuery(abilitiesQueryOptions);

  const { data: ranksData } = useQuery(ranksQueryOptions);

  const queryStatOptions: AnalyticsApiItemStatsRequest = useMemo(
    () => ({
      minMatches,
      heroId: hero,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      includeItemIds: includeItems.size > 0 ? Array.from(includeItems) : undefined,
      excludeItemIds: excludeItems.size > 0 ? Array.from(excludeItems) : undefined,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
    }),
    [
      minMatches,
      hero,
      minRankId,
      maxRankId,
      minUnixTimestamp,
      maxUnixTimestamp,
      includeItems,
      excludeItems,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
    ],
  );

  const {
    data = [],
    isLoading: isLoadingItemStats,
    isPlaceholderData: isRefetchingItemStats,
  } = useQuery({
    ...itemStatsQueryOptions(queryStatOptions),
    placeholderData: keepPreviousData,
  });

  const prevQueryStatOptions: AnalyticsApiItemStatsRequest = useMemo(
    () => ({
      minMatches,
      heroId: hero,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: prevMinTimestamp ?? 0,
      maxUnixTimestamp: prevMaxTimestamp,
      includeItemIds: includeItems.size > 0 ? Array.from(includeItems) : undefined,
      excludeItemIds: excludeItems.size > 0 ? Array.from(excludeItems) : undefined,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
    }),
    [
      minMatches,
      hero,
      minRankId,
      maxRankId,
      prevMinTimestamp,
      prevMaxTimestamp,
      includeItems,
      excludeItems,
      minBoughtAtS,
      maxBoughtAtS,
      gameMode,
    ],
  );

  const { data: prevData } = useQuery({
    ...itemStatsQueryOptions(prevQueryStatOptions),
    enabled: hasPreviousInterval,
    placeholderData: keepPreviousData,
  });

  const prevStatsMap = useMemo(() => {
    if (!prevData) return undefined;
    const prevSumMatches = prevData.reduce((acc, row) => acc + row.matches, 0);
    const prevMaxMatches = Math.max(...prevData.map((item) => item.matches));
    const map = new Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>();
    for (const row of prevData) {
      map.set(row.item_id, {
        winrate: row.wins / row.matches,
        pickrate: row.matches / prevSumMatches,
        normalizedPickrate: row.matches / prevMaxMatches,
      });
    }
    return map;
  }, [prevData]);

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
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
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
      const abilityIds = heroAbilityMetadata?.abilityIdToSlot;
      const shopItems = player.items.filter((i) => i.upgrade_id === 1 && !abilityIds?.has(i.item_id));
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
    <div className="space-y-4">
      <div className={cn("gap-4", topBuildsEnabled ? "flex flex-col lg:flex-row" : "")}>
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Item Stats</h3>
          </div>
          <div className="p-4">
            <ItemStatsTable
              data={displayData}
              isLoading={isLoadingItemStats || isLoadingItemAssets}
              isRefetching={isRefetchingItemStats}
              columns={["winRate", "matches", "itemsTier", "confidence"]}
              hideHeader={false}
              hideIndex={true}
              hideItemTierFilter={false}
              minWinRate={minWinRate}
              maxWinRate={maxWinRate}
              minUsage={minUsage}
              maxUsage={maxUsage}
              prevStatsMap={prevStatsMap}
              customDropdownContent={({ itemId, rowTotal }) => (
                <ItemBuyTimingChart itemIds={[itemId]} baseQueryOptions={queryStatOptions} rowTotalMatches={rowTotal} />
              )}
            />
          </div>
        </div>

        {topBuildsEnabled && (
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] lg:w-96 lg:shrink-0">
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Top Builds</h3>
            </div>
            <div className="overflow-x-auto p-4">
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
                <p className="py-4 text-center text-sm text-muted-foreground">No matching builds found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
