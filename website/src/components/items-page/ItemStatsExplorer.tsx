import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ItemStats } from "deadlock_api_client";
import type { AnalyticsApiItemStatsRequest, MatchesApiBulkMetadataRequest } from "deadlock_api_client";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { ItemBuyTimingChart } from "~/components/items-page/ItemBuyTimingChart";
import { getDisplayItemStats, ItemStatsTable, type ItemStatsTableProps } from "~/components/items-page/ItemStatsTable";
import { PlayerHeroBuildsDialog } from "~/components/items-page/PlayerHeroBuildsDialog";
import { LoadingLogo } from "~/components/LoadingLogo";
import MatchHistoryCard from "~/components/MatchHistoryCard";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import type { MatchMode } from "~/components/selectors/MatchModeSelector";
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

const TABLE_COLUMNS = ["winRate", "matches", "itemsTier", "confidence"];

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
  matchMode,
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
  matchMode?: MatchMode;
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
      matchMode,
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
      matchMode,
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
      matchMode,
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
      matchMode,
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
  const [topBuildsOpen, setTopBuildsOpen] = useState(false);

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
    matchMode,
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
  const shopableItemIds = useMemo(
    () =>
      new Set(
        assetsItems?.filter((item) => !item.disabled && item.shopable && item.shop_image_webp).map((item) => item.id),
      ),
    [assetsItems],
  );
  const filteredData = useMemo(() => data.filter((item) => shopableItemIds.has(item.item_id)), [data, shopableItemIds]);

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
  const renderBuyTiming = useCallback<NonNullable<ItemStatsTableProps["customDropdownContent"]>>(
    ({ itemId, rowTotal }) => (
      <ItemBuyTimingChart itemIds={[itemId]} baseQueryOptions={queryStatOptions} rowTotalMatches={rowTotal} />
    ),
    [queryStatOptions],
  );

  if (isLoadingItemAssets) {
    return (
      <div className="flex h-full w-full items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-clip border border-white/[0.06] bg-white/[0.02]">
        <div className="relative flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Item Stats</h3>
          {topBuildsEnabled && (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 hidden border-l border-white/[0.06] transition-[width,opacity] duration-300 ease-in-out motion-reduce:transition-none lg:right-0 lg:block",
                topBuildsOpen ? "w-96 opacity-100" : "w-0 opacity-0",
              )}
            />
          )}
          {topBuildsEnabled && (
            <button
              type="button"
              aria-expanded={topBuildsOpen}
              onClick={() => setTopBuildsOpen((open) => !open)}
              className={cn(
                "absolute right-4 flex items-center gap-2 rounded text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-[right,translate] duration-300 ease-in-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none",
                topBuildsOpen && "lg:right-[calc(24rem-1rem)] lg:translate-x-full",
              )}
            >
              Top Builds
              {topBuildsOpen ? (
                <PanelRightClose aria-hidden="true" className="size-4" />
              ) : (
                <PanelRightOpen aria-hidden="true" className="size-4" />
              )}
            </button>
          )}
        </div>
        <div className={cn(topBuildsEnabled && "flex flex-col lg:flex-row")}>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="py-4">
              <ItemStatsTable
                data={displayData}
                isLoading={isLoadingItemStats || isLoadingItemAssets}
                isRefetching={isRefetchingItemStats}
                columns={TABLE_COLUMNS}
                hideHeader={false}
                hideIndex={true}
                hideItemTierFilter={false}
                minWinRate={minWinRate}
                maxWinRate={maxWinRate}
                minUsage={minUsage}
                maxUsage={maxUsage}
                prevStatsMap={prevStatsMap}
                customDropdownContent={renderBuyTiming}
              />
            </div>
          </div>

          {topBuildsEnabled && (
            <div
              aria-hidden={!topBuildsOpen}
              inert={!topBuildsOpen}
              className={cn(
                "grid min-w-0 overflow-clip border-white/[0.06] transition-[width,grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none lg:shrink-0 lg:grid-rows-[1fr]",
                topBuildsOpen
                  ? "grid-rows-[1fr] border-t opacity-100 lg:w-96 lg:border-t-0 lg:border-l"
                  : "grid-rows-[0fr] opacity-0 lg:w-0",
              )}
            >
              <div className="flex min-h-0 min-w-0 flex-col overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-[calc(24rem-1px)]">
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
            </div>
          )}
        </div>
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
