import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { HeroTab } from "~/hooks/useHeroFilters";
import {
  type HeroesTabPrefetchFilters,
  type ItemsTab,
  type ItemsTabPrefetchFilters,
  prefetchHeroesTabs,
  prefetchItemsTabs,
} from "~/lib/tab-prefetch";

function shouldSkipPrefetch(): boolean {
  if (typeof navigator === "undefined") return true;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return true;
  return false;
}

function scheduleIdle(run: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timeout = window.setTimeout(run, 1500);
  return () => window.clearTimeout(timeout);
}

export function useHeroesTabPrefetchIdle(activeTab: HeroTab, filters: HeroesTabPrefetchFilters) {
  const queryClient = useQueryClient();
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — re-fire when any filter field changes
  useEffect(() => {
    if (shouldSkipPrefetch()) return;
    return scheduleIdle(() => prefetchHeroesTabs(queryClient, activeTab, filters));
  }, [
    queryClient,
    activeTab,
    filters.minRankId,
    filters.maxRankId,
    filters.minHeroMatches,
    filters.minHeroMatchesTotal,
    filters.minMatches,
    filters.sameLaneFilter,
    filters.heroId,
    filters.heroStat,
    filters.heroTimeInterval,
    filters.startDate?.valueOf(),
    filters.endDate?.valueOf(),
    filters.prevStartDate?.valueOf(),
    filters.prevEndDate?.valueOf(),
    filters.gameMode,
  ]);
}

export function useItemsTabPrefetchIdle(activeTab: ItemsTab, filters: ItemsTabPrefetchFilters) {
  const queryClient = useQueryClient();
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — re-fire when any filter field changes
  useEffect(() => {
    if (shouldSkipPrefetch()) return;
    return scheduleIdle(() => prefetchItemsTabs(queryClient, activeTab, filters));
  }, [
    queryClient,
    activeTab,
    filters.minRankId,
    filters.maxRankId,
    filters.hero,
    filters.minMatches,
    filters.minBoughtAtS,
    filters.maxBoughtAtS,
    filters.startDate?.valueOf(),
    filters.endDate?.valueOf(),
    filters.prevStartDate?.valueOf(),
    filters.prevEndDate?.valueOf(),
    filters.gameMode,
  ]);
}
