import type {
  AbilityOrderStatsGameModeEnum,
  AnalyticsApiBadgeDistributionRequest,
  AnalyticsApiKillDeathStatsRequest,
  GameStatsBucketEnum,
  ItemStatsBucketEnum,
} from "deadlock_api_client";

import type { GameMode } from "~/components/selectors/GameModeSelector";

import { patronQueryKeys } from "./patron-queries";

type Nullable<T> = T | null | undefined;

export interface HeroStatsKeyParams {
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  minHeroMatches?: Nullable<number>;
  minHeroMatchesTotal?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface HeroSynergyStatsKeyParams {
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  sameLaneFilter?: Nullable<boolean>;
  samePartyFilter?: Nullable<boolean>;
  minMatches?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface HeroCounterStatsKeyParams {
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  sameLaneFilter?: Nullable<boolean>;
  minMatches?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface HeroCombStatsKeyParams {
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  combSize?: Nullable<number>;
  minHeroMatches?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface HeroStatsByRankKeyParams {
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  minHeroMatches?: Nullable<number>;
  minHeroMatchesTotal?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface HeroStatsOverTimeKeyParams {
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  heroTimeInterval?: Nullable<string>;
  minHeroMatches?: Nullable<number>;
  minHeroMatchesTotal?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface HeroStatsByDurationKeyParams {
  minDurationS: number;
  maxDurationS: number;
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  minHeroMatches?: Nullable<number>;
  minHeroMatchesTotal?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface HeroStatsByExperienceKeyParams {
  minExperience: number;
  maxExperience: number;
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  minHeroMatches?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface ItemStatsKeyParams {
  minMatches?: Nullable<number>;
  hero?: Nullable<number>;
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  bucket?: Nullable<ItemStatsBucketEnum>;
  includeItems?: number[] | string;
  excludeItems?: number[] | string;
  minBoughtAtS?: Nullable<number>;
  maxBoughtAtS?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export interface GameStatsKeyParams {
  bucket?: Nullable<GameStatsBucketEnum>;
  gameMode?: Nullable<GameMode>;
  minUnixTimestamp?: Nullable<number>;
  maxUnixTimestamp?: Nullable<number>;
  minDurationS?: Nullable<number>;
  maxDurationS?: Nullable<number>;
  minAverageBadge?: Nullable<number>;
  maxAverageBadge?: Nullable<number>;
}

export interface AbilityOrderStatsKeyParams {
  heroId: number;
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  minMatches?: Nullable<number>;
  gameMode?: Nullable<AbilityOrderStatsGameModeEnum>;
  includeItemIds?: Nullable<number[]>;
  excludeItemIds?: Nullable<number[]>;
}

export interface PlayerScoreboardKeyParams {
  sortBy: string;
  sortDirection: string;
  gameMode?: Nullable<GameMode>;
  heroId?: Nullable<number>;
  minMatches?: Nullable<number>;
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  startDate?: Nullable<number>;
  endDate?: Nullable<number>;
}

export interface TopBuildsKeyParams {
  hero?: Nullable<number>;
  includeItems: number[];
  excludeItems: number[];
  minRankId?: Nullable<number>;
  maxRankId?: Nullable<number>;
  minDateTimestamp?: Nullable<number>;
  maxDateTimestamp?: Nullable<number>;
  gameMode?: Nullable<GameMode>;
}

export const queryKeys = {
  assets: {
    heroes: () => ["assets-heroes"] as const,
    itemUpgrades: () => ["assets-items-upgrades"] as const,
    abilities: () => ["assets-items-abilities"] as const,
    ranks: () => ["assets-ranks"] as const,
    hero: (heroId: number) => ["assets-hero", heroId] as const,
  },
  analytics: {
    heroStats: (params: HeroStatsKeyParams) => ["api-hero-stats", params] as const,
    heroSynergyStats: (params: HeroSynergyStatsKeyParams) => ["api-hero-synergy-stats", params] as const,
    heroCounterStats: (params: HeroCounterStatsKeyParams) => ["api-hero-counter-stats", params] as const,
    heroCombStats: (params: HeroCombStatsKeyParams) => ["api-hero-comb-stats", params] as const,
    heroStatsByRank: (params: HeroStatsByRankKeyParams) => ["api-hero-stats-by-rank", params] as const,
    heroStatsOverTime: (params: HeroStatsOverTimeKeyParams) => ["api-hero-stats-over-time", params] as const,
    heroStatsByDuration: (params: HeroStatsByDurationKeyParams) => ["api-hero-stats-by-duration", params] as const,
    heroStatsByExperience: (params: HeroStatsByExperienceKeyParams) =>
      ["api-hero-stats-by-experience", params] as const,
    itemStats: (params: ItemStatsKeyParams) => ["api-item-stats", params] as const,
    gameStats: (params: GameStatsKeyParams) => ["api-game-stats", params] as const,
    abilityOrderStats: (params: AbilityOrderStatsKeyParams) => ["api-ability-order-stats", params] as const,
    killDeathStats: (params: AnalyticsApiKillDeathStatsRequest) => ["killDeathStats", params] as const,
    badgeDistribution: (filter: AnalyticsApiBadgeDistributionRequest) => ["badgeDistribution", filter] as const,
    playerScoreboard: (params: PlayerScoreboardKeyParams) => ["playerScoreboard", params] as const,
    topBuilds: (params: TopBuildsKeyParams) => ["top-builds", params] as const,
  },
  leaderboard: {
    data: (region: string, heroId?: number | null) => ["leaderboardData", region, heroId] as const,
    ranks: () => ["ranks"] as const,
  },
  steam: {
    profiles: (batch: number[]) => ["steamProfiles", batch] as const,
    profile: (accountId: number | undefined) => ["steam-profile", accountId] as const,
    name: (region: string, steamId: string) => ["steamName", region, steamId] as const,
  },
  streamkit: {
    version: (widgetType: string | undefined) => ["version", widgetType] as const,
    stats: (region: string, accountId: string, ...rest: unknown[]) => ["stats", region, accountId, ...rest] as const,
    heroes: () => ["heroes"] as const,
    matchHistory: (accountId: string) => ["match-history", accountId] as const,
    availableVariables: () => ["available-variables"] as const,
    preview: (url: string) => ["preview", url] as const,
  },
  map: () => ["map"] as const,
  patron: patronQueryKeys,
} as const;
