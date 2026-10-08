import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ItemStats } from "deadlock_api_client";
import type { AnalyticsApiItemStatsRequest, MatchesApiBulkMetadataRequest } from "deadlock_api_client";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { lazy, Suspense, useDeferredValue, useMemo, useState } from "react";

import MatchHistoryCard from "~/components/domain/match/MatchHistoryCard";
import { getDisplayItemStats, ItemStatsTable, useItemStatsRow } from "~/components/features/items/ItemStatsTable";
import { PlayerHeroBuildsDialog } from "~/components/features/items/PlayerHeroBuildsDialog";
import { corruptedItemsParam, useCorruptedItemMode } from "~/components/features/items/useCorruptedItemMode";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import { Stack } from "~/components/ui/stack";
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
import { enemyHeroFilter } from "~/lib/enemy-heroes";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { parseAsSetOf } from "~/lib/nuqs-parsers";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";
import { queryKeys } from "~/queries/query-keys";
import { ranksQueryOptions } from "~/queries/ranks-query";

const NO_ENEMIES: readonly number[] = [];

// Recharts (~90 KB gzip) is only needed once a row is opened.
const ItemBuyTimingChart = lazy(() =>
  import("~/components/features/items/ItemBuyTimingChart").then((m) => ({ default: m.ItemBuyTimingChart })),
);

/** The details of an item row: when in a match the item is bought, and how that moves its win rate. */
function RowBuyTiming({ baseQueryOptions }: { baseQueryOptions: AnalyticsApiItemStatsRequest }) {
  const row = useItemStatsRow();
  return (
    <Suspense fallback={<LoadingState label="buy timing" size="sm" align="center" />}>
      <ItemBuyTimingChart itemIds={[row.itemId]} baseQueryOptions={baseQueryOptions} rowTotalMatches={row.matches} />
    </Suspense>
  );
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
  enemies = NO_ENEMIES,
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
  /** Only matches with these heroes on the other team: which items win against them. */
  enemies?: readonly number[];
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
  const [corruptedMode] = useCorruptedItemMode();
  const corruptedItems = corruptedItemsParam(corruptedMode);

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
      ...enemyHeroFilter(enemies),
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
      corruptedItems,
    }),
    [
      minMatches,
      hero,
      enemies,
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
      corruptedItems,
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

  // With both kinds of purchase counted, each item's corrupted purchases split its pick rate and win rate cells.
  const { data: corruptedData } = useQuery({
    ...itemStatsQueryOptions({ ...queryStatOptions, corruptedItems: "only" }),
    enabled: corruptedMode === "include",
    placeholderData: keepPreviousData,
  });
  const corruptedStatsMap = useMemo(
    () =>
      corruptedMode === "include" && corruptedData
        ? new Map(corruptedData.map((stat) => [stat.item_id, { wins: stat.wins, matches: stat.matches }]))
        : undefined,
    [corruptedMode, corruptedData],
  );

  const prevQueryStatOptions: AnalyticsApiItemStatsRequest = useMemo(
    () => ({
      minMatches,
      heroId: hero,
      ...enemyHeroFilter(enemies),
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
      enemies,
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

  // Corrupted purchases began with the City Never Sleeps update: a period before it has none to compare with.
  const comparesPrevious = hasPreviousInterval && corruptedMode !== "only";
  const { data: prevData } = useQuery({
    ...itemStatsQueryOptions(prevQueryStatOptions),
    enabled: comparesPrevious,
    placeholderData: keepPreviousData,
  });

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
    includeItemIds: Array.from(includeItems, String).sort().join(","),
    excludeItemIds: excludeItems.size > 0 ? Array.from(excludeItems, String).sort().join(",") : undefined,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    gameMode: gameMode,
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

  const shopableItemIds = useMemo(
    () =>
      new Set(
        assetsItems?.filter((item) => !item.disabled && item.shopable && item.shop_image_webp).map((item) => item.id),
      ),
    [assetsItems],
  );
  const filteredData = useMemo(() => data.filter((item) => shopableItemIds.has(item.item_id)), [data, shopableItemIds]);
  // Scale the bars to the rows on screen: a hidden non-shop item with an extreme rate would squash every visible bar.
  const minWinRate = useMemo(() => Math.min(...filteredData.map((item) => item.wins / item.matches)), [filteredData]);
  const maxWinRate = useMemo(() => Math.max(...filteredData.map((item) => item.wins / item.matches)), [filteredData]);
  const minUsage = useMemo(() => Math.min(...filteredData.map((item) => item.matches)), [filteredData]);
  const maxUsage = useMemo(() => Math.max(...filteredData.map((item) => item.matches)), [filteredData]);
  const prevStatsMap = useMemo(() => {
    if (!prevData || !comparesPrevious) return undefined;
    const prevSumMatches = prevData.reduce((acc, row) => acc + row.matches, 0);
    // On the same base as this period's bars (shop items only), or the pick rate delta compares two scales.
    const prevMaxMatches = Math.max(
      ...prevData.filter((item) => shopableItemIds.has(item.item_id)).map((item) => item.matches),
    );
    const map = new Map<number, { winrate: number; pickrate: number; normalizedPickrate: number }>();
    for (const row of prevData) {
      map.set(row.item_id, {
        winrate: row.wins / row.matches,
        pickrate: row.matches / prevSumMatches,
        normalizedPickrate: row.matches / prevMaxMatches,
      });
    }
    return map;
  }, [prevData, comparesPrevious, shopableItemIds]);

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
  // Every row takes these options, so a filter change re-renders the whole table. Deferred, that render is
  // interruptible and stays out of the interaction that changed the filter.
  const rowQueryOptions = useDeferredValue(queryStatOptions);
  // One element for every row, so a re-render here leaves the memoized rows alone.
  const rowDetails = useMemo(() => <RowBuyTiming baseQueryOptions={rowQueryOptions} />, [rowQueryOptions]);

  if (isLoadingItemAssets) {
    return <LoadingState label="item stats" align="center" />;
  }

  return (
    <Stack gap={4}>
      <div className={cn(topBuildsEnabled && "flex flex-col gap-4 lg:flex-row")}>
        <div className="min-w-0 flex-1">
          <ItemStatsTable
            data={displayData}
            isLoading={isLoadingItemStats || isLoadingItemAssets}
            isRefetching={isRefetchingItemStats}
            minWinRate={minWinRate}
            maxWinRate={maxWinRate}
            minUsage={minUsage}
            maxUsage={maxUsage}
            trendParams={rowQueryOptions}
            prevStatsMap={prevStatsMap}
            corruptedStatsMap={corruptedStatsMap}
            details={rowDetails}
            actions={
              topBuildsEnabled && (
                <Button
                  variant="ghost"
                  size="xs"
                  aria-expanded={topBuildsOpen}
                  onClick={() => setTopBuildsOpen((open) => !open)}
                  className="text-muted-foreground"
                >
                  Top Builds
                  {topBuildsOpen ? (
                    <PanelRightClose aria-hidden="true" className="size-4" />
                  ) : (
                    <PanelRightOpen aria-hidden="true" className="size-4" />
                  )}
                </Button>
              )
            }
          />
        </div>

        {topBuildsEnabled && topBuildsOpen && (
          <>
            <Separator className="lg:hidden" />
            <Separator orientation="vertical" className="hidden lg:block" />
            <div className="flex min-h-0 min-w-0 flex-col overflow-hidden lg:sticky lg:top-0 lg:max-h-dvh lg:w-96 lg:shrink-0">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {isLoadingTopBuilds ? (
                  <LoadingState label="top builds" size="sm" align="center" />
                ) : topBuildsCards.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {topBuildsCards.map((card) => (
                      <MatchHistoryCard
                        key={card.matchId}
                        {...card}
                        ranks={ranksData}
                        onPlayerClick={(name) => setSelectedPlayer({ accountId: card.accountId, name })}
                      />
                    ))}
                    {(isFetchingTopBuilds || (topBuildsData?.length ?? 0) >= topBuildsLimit) && (
                      <Button
                        variant="subtle"
                        size="sm"
                        onClick={() => setTopBuildsLimit((prev) => prev + TOP_BUILDS_PAGE_SIZE)}
                        disabled={isFetchingTopBuilds}
                        className="w-full"
                      >
                        {isFetchingTopBuilds && <Spinner size="sm" />}
                        {isFetchingTopBuilds ? "Loading…" : "Load more"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <EmptyState variant="inline" title="No matching builds found." className="py-4" />
                )}
              </div>
            </div>
          </>
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
    </Stack>
  );
}
