import type { QueryClient } from "@tanstack/react-query";
import type {
  AnalyticsApiHeroBanStatsRequest,
  AnalyticsApiHeroCombStatsRequest,
  AnalyticsApiHeroCountersStatsRequest,
  AnalyticsApiHeroStatsRequest,
  AnalyticsApiHeroSynergiesStatsRequest,
  AnalyticsApiItemStatsRequest,
} from "deadlock_api_client/api";

import type { GameMode } from "~/components/selectors/GameModeSelector";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import type { HeroTab } from "~/hooks/useHeroFilters";
import { api } from "~/lib/api";
import { DURATION_BUCKETS } from "~/lib/constants";
import { normalizeUnixCeil, normalizeUnixFloor } from "~/lib/time-normalize";
import { queryKeys } from "~/queries/query-keys";

const EXPERIENCE_BUCKETS = [
  { min: 1, max: 25 },
  { min: 25, max: 100 },
  { min: 100, max: 500 },
  { min: 500, max: 10000 },
] as const;

interface TimeWindow {
  minUnixTimestamp: number;
  maxUnixTimestamp: number | undefined;
}

interface PrevTimeWindow {
  minUnixTimestamp: number;
  maxUnixTimestamp: number | undefined;
  enabled: boolean;
}

function toWindow(minDate?: Dayjs, maxDate?: Dayjs): TimeWindow {
  return {
    minUnixTimestamp: normalizeUnixFloor(minDate) ?? 0,
    maxUnixTimestamp: normalizeUnixCeil(maxDate),
  };
}

function toPrevWindow(prevMin?: Dayjs, prevMax?: Dayjs): PrevTimeWindow {
  const enabled = prevMin != null && prevMax != null;
  return {
    minUnixTimestamp: normalizeUnixFloor(prevMin) ?? 0,
    maxUnixTimestamp: normalizeUnixCeil(prevMax),
    enabled,
  };
}

function prefetchHeroStats(qc: QueryClient, params: AnalyticsApiHeroStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroStats(params),
    queryFn: async () => (await api.analytics_api.heroStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

function prefetchHeroBanStats(qc: QueryClient, params: AnalyticsApiHeroBanStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroBanStats(params),
    queryFn: async () => (await api.analytics_api.heroBanStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

function prefetchHeroStatsOverTime(qc: QueryClient, params: AnalyticsApiHeroStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroStatsOverTime(params),
    queryFn: async () => (await api.analytics_api.heroStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

function prefetchHeroStatsByDuration(qc: QueryClient, params: AnalyticsApiHeroStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroStatsByDuration(params),
    queryFn: async () => (await api.analytics_api.heroStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

function prefetchHeroStatsByRank(qc: QueryClient, params: AnalyticsApiHeroStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroStatsByRank(params),
    queryFn: async () => (await api.analytics_api.heroStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

function prefetchHeroStatsByExperience(qc: QueryClient, params: AnalyticsApiHeroStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroStatsByExperience(params),
    queryFn: async () => (await api.analytics_api.heroStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

function prefetchHeroSynergy(qc: QueryClient, params: AnalyticsApiHeroSynergiesStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroSynergyStats(params),
    queryFn: async () => (await api.analytics_api.heroSynergiesStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

function prefetchHeroCounter(qc: QueryClient, params: AnalyticsApiHeroCountersStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroCounterStats(params),
    queryFn: async () => (await api.analytics_api.heroCountersStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_HOUR,
  });
}

function prefetchHeroComb(qc: QueryClient, params: AnalyticsApiHeroCombStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.heroCombStats(params),
    queryFn: async () => (await api.analytics_api.heroCombStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

function prefetchItemStats(qc: QueryClient, params: AnalyticsApiItemStatsRequest) {
  void qc.prefetchQuery({
    queryKey: queryKeys.analytics.itemStats(params),
    queryFn: async () => (await api.analytics_api.itemStats(params)).data,
    staleTime: CACHE_DURATIONS.ONE_DAY,
  });
}

export interface HeroesTabPrefetchFilters {
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minHeroMatchesTotal?: number;
  minMatches?: number;
  sameLaneFilter?: boolean;
  heroId?: number;
  heroStat?: string;
  heroTimeInterval?: "start_time_hour" | "start_time_day" | "start_time_week";
  startDate?: Dayjs;
  endDate?: Dayjs;
  prevStartDate?: Dayjs;
  prevEndDate?: Dayjs;
  gameMode?: GameMode;
}

type HeroesPrefetcher = (qc: QueryClient, f: HeroesTabPrefetchFilters) => void;

const HEROES_TAB_PREFETCHERS: Record<HeroTab, HeroesPrefetcher> = {
  stats: (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    const pw = toPrevWindow(f.prevStartDate, f.prevEndDate);
    const base: AnalyticsApiHeroStatsRequest = {
      minHeroMatches: f.minHeroMatches,
      minHeroMatchesTotal: f.minHeroMatchesTotal,
      minAverageBadge: f.minRankId,
      maxAverageBadge: f.maxRankId,
      ...w,
      gameMode: f.gameMode,
    };
    prefetchHeroStats(qc, base);
    if (pw.enabled) {
      prefetchHeroStats(qc, { ...base, minUnixTimestamp: pw.minUnixTimestamp, maxUnixTimestamp: pw.maxUnixTimestamp });
    }
    const banBase: AnalyticsApiHeroBanStatsRequest = {
      minAverageBadge: f.minRankId,
      maxAverageBadge: f.maxRankId,
      ...w,
    };
    prefetchHeroBanStats(qc, banBase);
    if (pw.enabled) {
      prefetchHeroBanStats(qc, {
        ...banBase,
        minUnixTimestamp: pw.minUnixTimestamp,
        maxUnixTimestamp: pw.maxUnixTimestamp,
      });
    }
  },
  "stats-over-time": (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    const bucket = f.heroTimeInterval ?? "start_time_day";
    if (f.heroStat === "ban_rate") {
      prefetchHeroBanStats(qc, {
        bucket,
        minAverageBadge: f.minRankId,
        maxAverageBadge: f.maxRankId,
        ...w,
      });
    } else {
      prefetchHeroStatsOverTime(qc, {
        minHeroMatches: f.minHeroMatches,
        minHeroMatchesTotal: f.minHeroMatchesTotal,
        minAverageBadge: f.minRankId,
        maxAverageBadge: f.maxRankId,
        ...w,
        bucket,
        gameMode: f.gameMode,
      });
    }
  },
  "stats-by-duration": (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    const statToUse = f.heroStat === "ban_rate" ? "winrate" : f.heroStat;
    void statToUse;
    for (const b of DURATION_BUCKETS) {
      prefetchHeroStatsByDuration(qc, {
        minHeroMatches: f.minHeroMatches,
        minHeroMatchesTotal: f.minHeroMatchesTotal,
        minAverageBadge: f.minRankId,
        maxAverageBadge: f.maxRankId,
        ...w,
        minDurationS: b.minS,
        maxDurationS: b.maxS,
        bucket: "no_bucket",
        gameMode: f.gameMode,
      });
    }
  },
  "stats-by-rank": (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    prefetchHeroStatsByRank(qc, {
      minHeroMatches: f.minHeroMatches,
      minHeroMatchesTotal: f.minHeroMatchesTotal,
      ...w,
      bucket: "avg_badge",
      gameMode: f.gameMode,
    });
  },
  "stats-by-experience": (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    for (const b of EXPERIENCE_BUCKETS) {
      prefetchHeroStatsByExperience(qc, {
        minHeroMatches: f.minHeroMatches,
        minHeroMatchesTotal: b.min,
        maxHeroMatchesTotal: b.max,
        minAverageBadge: f.minRankId,
        maxAverageBadge: f.maxRankId,
        ...w,
        bucket: "no_bucket",
        gameMode: f.gameMode,
      });
    }
  },
  matchups: (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    const pw = toPrevWindow(f.prevStartDate, f.prevEndDate);
    const common = {
      minAverageBadge: f.minRankId,
      maxAverageBadge: f.maxRankId,
      gameMode: f.gameMode,
    };
    prefetchHeroStats(qc, { minHeroMatches: f.minMatches, ...common, ...w });
    prefetchHeroSynergy(qc, {
      sameLaneFilter: f.sameLaneFilter,
      minMatches: f.minMatches,
      ...common,
      ...w,
    });
    prefetchHeroCounter(qc, {
      sameLaneFilter: f.sameLaneFilter,
      minMatches: f.minMatches,
      ...common,
      ...w,
    });
    if (pw.enabled) {
      const pwin = { minUnixTimestamp: pw.minUnixTimestamp, maxUnixTimestamp: pw.maxUnixTimestamp };
      prefetchHeroStats(qc, { minHeroMatches: f.minMatches, ...common, ...pwin });
      prefetchHeroSynergy(qc, { sameLaneFilter: f.sameLaneFilter, minMatches: f.minMatches, ...common, ...pwin });
      prefetchHeroCounter(qc, { sameLaneFilter: f.sameLaneFilter, minMatches: f.minMatches, ...common, ...pwin });
    }
  },
  "hero-combs": (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    const pw = toPrevWindow(f.prevStartDate, f.prevEndDate);
    const params: AnalyticsApiHeroCombStatsRequest = {
      combSize: 2,
      minMatches: f.minMatches ?? 0,
      minAverageBadge: f.minRankId,
      maxAverageBadge: f.maxRankId,
      ...w,
      gameMode: f.gameMode,
    };
    prefetchHeroComb(qc, params);
    if (pw.enabled) {
      prefetchHeroComb(qc, {
        ...params,
        minUnixTimestamp: pw.minUnixTimestamp,
        maxUnixTimestamp: pw.maxUnixTimestamp,
      });
    }
  },
  "hero-matchup-details": (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    const common = {
      minAverageBadge: f.minRankId,
      maxAverageBadge: f.maxRankId,
      ...w,
      gameMode: f.gameMode,
    };
    prefetchHeroStats(qc, { minHeroMatches: f.minMatches ?? 0, ...common });
    prefetchHeroSynergy(qc, { sameLaneFilter: f.sameLaneFilter, minMatches: f.minMatches ?? 0, ...common });
    prefetchHeroCounter(qc, { sameLaneFilter: f.sameLaneFilter, minMatches: f.minMatches ?? 0, ...common });
  },
};

export function prefetchHeroesTabs(qc: QueryClient, activeTab: HeroTab, filters: HeroesTabPrefetchFilters) {
  for (const [tab, run] of Object.entries(HEROES_TAB_PREFETCHERS) as [HeroTab, HeroesPrefetcher][]) {
    if (tab === activeTab) continue;
    run(qc, filters);
  }
}

export interface ItemsTabPrefetchFilters {
  minRankId?: number;
  maxRankId?: number;
  hero?: number | null;
  minMatches?: number | null;
  minBoughtAtS?: number;
  maxBoughtAtS?: number;
  startDate?: Dayjs;
  endDate?: Dayjs;
  prevStartDate?: Dayjs;
  prevEndDate?: Dayjs;
  gameMode?: GameMode;
}

export type ItemsTab = "stats" | "item-purchase-analysis" | "item-combs";

type ItemsPrefetcher = (qc: QueryClient, f: ItemsTabPrefetchFilters) => void;

const ITEMS_TAB_PREFETCHERS: Record<ItemsTab, ItemsPrefetcher> = {
  stats: (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    const pw = toPrevWindow(f.prevStartDate, f.prevEndDate);
    const base: AnalyticsApiItemStatsRequest = {
      minMatches: f.minMatches,
      heroId: f.hero ?? null,
      minAverageBadge: f.minRankId,
      maxAverageBadge: f.maxRankId,
      ...w,
      minBoughtAtS: f.minBoughtAtS,
      maxBoughtAtS: f.maxBoughtAtS,
      gameMode: f.gameMode,
    };
    prefetchItemStats(qc, base);
    if (pw.enabled) {
      prefetchItemStats(qc, { ...base, minUnixTimestamp: pw.minUnixTimestamp, maxUnixTimestamp: pw.maxUnixTimestamp });
    }
  },
  "item-purchase-analysis": () => {
    // No primary query fires without user-selected items.
  },
  "item-combs": (qc, f) => {
    const w = toWindow(f.startDate, f.endDate);
    prefetchItemStats(qc, {
      minMatches: f.minMatches,
      heroId: f.hero ?? null,
      minAverageBadge: f.minRankId,
      maxAverageBadge: f.maxRankId,
      ...w,
      includeItemIds: undefined,
      excludeItemIds: undefined,
      minBoughtAtS: f.minBoughtAtS,
      maxBoughtAtS: f.maxBoughtAtS,
      gameMode: f.gameMode,
    });
  },
};

export function prefetchItemsTabs(qc: QueryClient, activeTab: ItemsTab, filters: ItemsTabPrefetchFilters) {
  for (const [tab, run] of Object.entries(ITEMS_TAB_PREFETCHERS) as [ItemsTab, ItemsPrefetcher][]) {
    if (tab === activeTab) continue;
    run(qc, filters);
  }
}
