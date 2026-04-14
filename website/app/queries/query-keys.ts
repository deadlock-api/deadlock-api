import type { AnalyticsApiBadgeDistributionRequest, AnalyticsApiKillDeathStatsRequest } from "deadlock_api_client";
import {
  AnalyticsApiAbilityOrderStatsRequest,
  AnalyticsApiGameStatsRequest,
  AnalyticsApiHeroBanStatsRequest,
  AnalyticsApiHeroCombStatsRequest,
  AnalyticsApiHeroCountersStatsRequest,
  AnalyticsApiHeroStatsRequest,
  AnalyticsApiHeroSynergiesStatsRequest,
  AnalyticsApiItemStatsRequest,
  AnalyticsApiPlayerScoreboardRequest,
  MatchesApiBulkMetadataRequest,
} from "deadlock_api_client/api";

export const queryKeys = {
  assets: {
    heroes: () => ["assets-heroes"] as const,
    itemUpgrades: () => ["assets-items-upgrades"] as const,
    abilities: () => ["assets-items-abilities"] as const,
    ranks: () => ["assets-ranks"] as const,
    hero: (heroId: number) => ["assets-hero", heroId] as const,
  },
  analytics: {
    heroStats: (params: AnalyticsApiHeroStatsRequest) => ["api-hero-stats", params] as const,
    heroBanStats: (params: AnalyticsApiHeroBanStatsRequest) => ["api-hero-ban-stats", params] as const,
    heroSynergyStats: (params: AnalyticsApiHeroSynergiesStatsRequest) => ["api-hero-synergy-stats", params] as const,
    heroCounterStats: (params: AnalyticsApiHeroCountersStatsRequest) => ["api-hero-counter-stats", params] as const,
    heroCombStats: (params: AnalyticsApiHeroCombStatsRequest) => ["api-hero-comb-stats", params] as const,
    heroStatsByRank: (params: AnalyticsApiHeroStatsRequest) => ["api-hero-stats-by-rank", params] as const,
    heroStatsOverTime: (params: AnalyticsApiHeroStatsRequest) => ["api-hero-stats-over-time", params] as const,
    heroStatsByDuration: (params: AnalyticsApiHeroStatsRequest) => ["api-hero-stats-by-duration", params] as const,
    heroStatsByExperience: (params: AnalyticsApiHeroStatsRequest) => ["api-hero-stats-by-experience", params] as const,
    itemStats: (params: AnalyticsApiItemStatsRequest) => ["api-item-stats", params] as const,
    gameStats: (params: AnalyticsApiGameStatsRequest) => ["api-game-stats", params] as const,
    abilityOrderStats: (params: AnalyticsApiAbilityOrderStatsRequest) => ["api-ability-order-stats", params] as const,
    killDeathStats: (params: AnalyticsApiKillDeathStatsRequest) => ["api-kill-death-stats", params] as const,
    badgeDistribution: (filter: AnalyticsApiBadgeDistributionRequest) => ["api-badge-distribution", filter] as const,
    playerScoreboard: (params: AnalyticsApiPlayerScoreboardRequest) => ["api-player-scoreboard", params] as const,
    topBuilds: (params: MatchesApiBulkMetadataRequest) => ["api-top-builds", params] as const,
  },
  leaderboard: {
    data: (region: string, heroId?: number | null) => ["api-leaderboard-data", region, heroId] as const,
  },
  servers: {
    list: () => ["api-servers-list"] as const,
  },
  steam: {
    profiles: (batch: number[]) => ["steam-profiles", batch] as const,
    profile: (accountId: number | undefined) => ["steam-profile", accountId] as const,
    name: (region: string, steamId: string) => ["steam-name", region, steamId] as const,
  },
  streamkit: {
    version: (widgetType: string | undefined) => ["api-streamkit-version", widgetType] as const,
    stats: (region: string, accountId: string, ...rest: unknown[]) =>
      ["api-streamkit-stats", region, accountId, ...rest] as const,
    matchHistory: (accountId: string) => ["api-match-history", accountId] as const,
    availableVariables: () => ["api-streamkit-available-variables"] as const,
    preview: (url: string) => ["api-streamkit-preview", url] as const,
  },
  map: () => ["map"] as const,
  patron: {
    all: ["patron"] as const,
    status: () => [...queryKeys.patron.all, "status"] as const,
    steamAccounts: () => [...queryKeys.patron.all, "steam-accounts"] as const,
    playerCard: (steamId3: number) => [...queryKeys.patron.all, "player-card", steamId3] as const,
  },
} as const;
