import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ItemStats } from "deadlock_api_client";
import type { AnalyticsApiItemStatsRequest, MatchesApiBulkMetadataRequest } from "deadlock_api_client";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";

import { ItemBuyTimingChart } from "~/components/items-page/ItemBuyTimingChart";
import { getDisplayItemStats, ItemStatsTable } from "~/components/items-page/ItemStatsTable";
import { PlayerHeroBuildsDialog } from "~/components/items-page/PlayerHeroBuildsDialog";
import { LoadingLogo } from "~/components/LoadingLogo";
import MatchHistoryCard from "~/components/MatchHistoryCard";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import {
  type BulkMatchMetadata,
  buildPlayerBuildCards,
  buildUpgradeChainLookup,
  getHeroAbilityMetadata,
} from "~/lib/build-transform";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";

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

  // Build lookup: item_id → class_name, and item_id → component class_names (upgrade-vs-sold detection)
  const upgradeChainLookup = useMemo(() => buildUpgradeChainLookup(assetsItems), [assetsItems]);

  const [selectedPlayer, setSelectedPlayer] = useState<{ accountId: number; name?: string } | null>(null);

  const TOP_BUILDS_PAGE_SIZE = 20;
  const [topBuildsLimit, setTopBuildsLimit] = useState(TOP_BUILDS_PAGE_SIZE);

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
    limit: topBuildsLimit,
  };
  const {
    data: topBuildsData,
    isLoading: isLoadingTopBuilds,
    isFetching: isFetchingTopBuilds,
  } = useQuery({
    queryKey: queryKeys.analytics.topBuilds(topBuildsQuery),
    queryFn: async () => {
      const response = await api.matches_api.bulkMetadata(topBuildsQuery);
      return response.data as unknown as BulkMatchMetadata[];
    },
    enabled: topBuildsEnabled,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
    placeholderData: keepPreviousData,
  });

  const topBuildsCards = useMemo(() => {
    if (!topBuildsData || !hero) return [];
    const heroData = heroesData?.find((currentHero) => currentHero.id === hero);
    const heroAbilityMetadata = getHeroAbilityMetadata(heroData, abilityItems);
    return buildPlayerBuildCards(topBuildsData, hero, heroAbilityMetadata, upgradeChainLookup);
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
          <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-96 lg:shrink-0 lg:self-start">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Top Builds</h3>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {isLoadingTopBuilds ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingLogo />
                </div>
              ) : topBuildsCards.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {topBuildsCards.map((card) => (
                    <MatchHistoryCard
                      key={card.matchId}
                      {...card}
                      ranks={ranksData}
                      expandable={false}
                      onPlayerClick={(name) => setSelectedPlayer({ accountId: card.accountId, name })}
                    />
                  ))}
                  {(isFetchingTopBuilds || (topBuildsData?.length ?? 0) >= topBuildsLimit) && (
                    <button
                      type="button"
                      onClick={() => setTopBuildsLimit((prev) => prev + TOP_BUILDS_PAGE_SIZE)}
                      disabled={isFetchingTopBuilds}
                      className="mt-1 flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isFetchingTopBuilds ? "Loading…" : "Load more"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">No matching builds found.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {hero != null && (
        <PlayerHeroBuildsDialog
          open={selectedPlayer != null}
          onOpenChange={(open) => {
            if (!open) setSelectedPlayer(null);
          }}
          accountId={selectedPlayer?.accountId ?? null}
          playerName={selectedPlayer?.name}
          heroId={hero}
          minUnixTimestamp={minUnixTimestamp ?? undefined}
          maxUnixTimestamp={maxUnixTimestamp ?? undefined}
          ranks={ranksData}
        />
      )}
    </div>
  );
}
