import type {
  AnalyticsApiAbilityOrderStatsRequest,
  AnalyticsApiBadgeDistributionRequest,
  AnalyticsApiBuffStatsRequest,
  AnalyticsApiGameStatsRequest,
  AnalyticsApiHeroBanStatsRequest,
  AnalyticsApiHeroBuildStatsRequest,
  AnalyticsApiHeroCombStatsRequest,
  AnalyticsApiHeroCountersStatsRequest,
  AnalyticsApiHeroScoreboardRequest,
  AnalyticsApiHeroStatsRequest,
  AnalyticsApiHeroSwapStatsRequest,
  AnalyticsApiHeroSynergiesStatsRequest,
  AnalyticsApiItemPermutationStatsRequest,
  AnalyticsApiItemStatsRequest,
  AnalyticsApiKillDeathStatsRequest,
  AnalyticsApiLaneMatchupStatsRequest,
  AnalyticsApiLaneSoulCurveRequest,
  AnalyticsApiPlayerPerformanceCurveRequest,
  AnalyticsApiPlayerScoreboardRequest,
  AnalyticsApiPlayerStatsMetricsRequest,
  MatchesApiBulkMetadataRequest,
  PlayersApiEnemyStatsRequest,
  PlayersApiMateStatsRequest,
  PlayersApiPlayerHeroStatsRequest,
} from "deadlock_api_client";

/** Where match metadata may come from: GraphQL with the REST endpoint as fallback, or GraphQL alone. */
export type MatchMetadataSource = "any" | "graphql";

export const queryKeys = {
  assets: {
    ranks: () => ["assets-ranks"] as const,
    heroes: () => ["assets-heroes"] as const,
    heroesFull: () => ["assets-heroes-full"] as const,
    /** Retired and unreleased heroes too. */
    heroesAll: () => ["assets-heroes-all"] as const,
    abilities: () => ["assets-items-abilities"] as const,
    npcUnits: () => ["assets-npc-units"] as const,
    sounds: () => ["assets-sounds"] as const,
    itemUpgrades: () => ["assets-items-upgrades"] as const,
    itemUpgradesFull: () => ["assets-items-upgrades-full"] as const,
    item: (itemId: number) => ["assets-item", itemId] as const,
    rankedSeasons: () => ["assets-ranked-seasons"] as const,
    miscEntities: () => ["assets-misc-entities"] as const,
    corruption: () => ["assets-corruption"] as const,
    itemPricePerTier: () => ["assets-item-price-per-tier"] as const,
  },
  leaderboard: {
    data: (region: string, heroId?: number | null) => ["api-leaderboard-data", region, heroId] as const,
  },
  analytics: {
    badgeDistribution: (filter: AnalyticsApiBadgeDistributionRequest) => ["api-badge-distribution", filter] as const,
    abilityOrderStats: (params: AnalyticsApiAbilityOrderStatsRequest) => ["api-ability-order-stats", params] as const,
    itemFlowStats: (params: unknown) => ["api-item-flow-stats", params] as const,
    killDeathStats: (filter: AnalyticsApiKillDeathStatsRequest) => ["api-kill-death-stats", filter] as const,
    itemStats: (filter: AnalyticsApiItemStatsRequest) => ["api-item-stats", filter] as const,
    itemPermutationStats: (params: AnalyticsApiItemPermutationStatsRequest) =>
      ["api-item-permutation-stats", params] as const,
    heroStats: (params: AnalyticsApiHeroStatsRequest) => ["api-hero-stats", params] as const,
    heroBanStats: (params: AnalyticsApiHeroBanStatsRequest) => ["api-hero-ban-stats", params] as const,
    heroBuildStats: (params: AnalyticsApiHeroBuildStatsRequest) => ["api-hero-build-stats", params] as const,
    /** The latest version of each build, `buildIds` sorted so one set of builds is one cache entry. */
    heroBuildMeta: (heroId: number, buildIds: readonly number[]) =>
      ["graphql-hero-build-meta", heroId, buildIds] as const,
    /** One build by its ID alone, to find the hero it is for. */
    heroBuildLookup: (buildId: number) => ["graphql-hero-build-lookup", buildId] as const,
    heroSwapStats: (params: AnalyticsApiHeroSwapStatsRequest) => ["api-hero-swap-stats", params] as const,
    heroTierInputs: (stats: AnalyticsApiHeroStatsRequest, bans: AnalyticsApiHeroBanStatsRequest | null) =>
      ["hero-tier-inputs", stats, bans] as const,
    heroSynergyStats: (params: AnalyticsApiHeroSynergiesStatsRequest) => ["api-hero-synergy-stats", params] as const,
    heroCounterStats: (params: AnalyticsApiHeroCountersStatsRequest) => ["api-hero-counter-stats", params] as const,
    heroCombStats: (params: AnalyticsApiHeroCombStatsRequest) => ["api-hero-comb-stats", params] as const,
    laneMatchupStats: (params: AnalyticsApiLaneMatchupStatsRequest) => ["api-lane-matchup-stats", params] as const,
    laneSoulCurve: (params: AnalyticsApiLaneSoulCurveRequest) => ["api-lane-soul-curve", params] as const,
    /** The heroes analytics views' own, packed copies of /hero-stats: other pages cache the same requests as rows. */
    heroChartStats: (
      view: "over-time" | "by-duration" | "by-rank" | "by-experience",
      params: AnalyticsApiHeroStatsRequest,
    ) => ["api-hero-chart-stats", view, params] as const,
    /** Packed hero pair win records: the matchup views read nothing else of the synergy and counter responses. */
    heroSynergyWins: (params: AnalyticsApiHeroSynergiesStatsRequest) => ["api-hero-synergy-wins", params] as const,
    heroCounterWins: (params: AnalyticsApiHeroCountersStatsRequest) => ["api-hero-counter-wins", params] as const,
    gameStats: (params: AnalyticsApiGameStatsRequest) => ["api-game-stats", params] as const,
    buffStats: (params: AnalyticsApiBuffStatsRequest) => ["api-buff-stats", params] as const,
    playerPerformanceCurve: (params: AnalyticsApiPlayerPerformanceCurveRequest) =>
      ["api-player-performance-curve", params] as const,
    playerScoreboard: (params: AnalyticsApiPlayerScoreboardRequest) => ["api-player-scoreboard", params] as const,
    playerStatsMetrics: (params: AnalyticsApiPlayerStatsMetricsRequest) =>
      ["api-player-stats-metrics", params] as const,
    heroScoreboard: (params: AnalyticsApiHeroScoreboardRequest) => ["api-hero-scoreboard", params] as const,
    topBuilds: (params: MatchesApiBulkMetadataRequest) => ["api-top-builds", params] as const,
    playerHeroBuilds: (accountId: number, heroId: number, minUnixTimestamp?: number, maxUnixTimestamp?: number) =>
      ["api-player-hero-builds", accountId, heroId, minUnixTimestamp ?? null, maxUnixTimestamp ?? null] as const,
  },
  matches: {
    importedDraft: (matchId: number | null) => ["api-imported-draft", matchId] as const,
    recentlyFetched: () => ["api-recently-fetched-matches"] as const,
  },
  steam: {
    profiles: (batch: number[]) => ["steam-profiles", batch] as const,
    profile: (accountId: number | undefined) => ["steam-profile", accountId] as const,
    name: (region: string, accountId: string) => ["steam-name", region, accountId] as const,
    search: (query: string) => ["steam-search", query] as const,
  },
  streamkit: {
    availableVariables: () => ["streamkit-available-variables"] as const,
    preview: (url: string) => ["streamkit-preview", url] as const,
    stats: (
      region: string,
      accountId: string,
      variables: readonly string[],
      extraArgs: Readonly<Record<string, string>>,
    ) => ["streamkit-stats", region, accountId, variables, extraArgs] as const,
    versions: () => ["streamkit-widget-versions"] as const,
  },
  crosshair: {
    codeSettings: (code: string) => ["api-crosshair-code-settings", code] as const,
    codeImage: (code: string, screenHeight: number) => ["api-crosshair-code-image", code, screenHeight] as const,
    code: (settings: object) => ["api-crosshair-code", settings] as const,
  },
  map: (clientVersion?: number) => ["assets-map", clientVersion ?? "latest"] as const,
  players: {
    matchHistory: (accountId: number) => ["api-player-match-history", accountId] as const,
    rank: (accountId: number) => ["api-player-rank", accountId] as const,
    rankBatch: (accountIds: number[]) => ["api-player-rank-batch", accountIds] as const,
    heroStats: (params: PlayersApiPlayerHeroStatsRequest) => ["api-player-hero-stats", params] as const,
    mateStats: (params: PlayersApiMateStatsRequest) => ["api-player-mate-stats", params] as const,
    enemyStats: (params: PlayersApiEnemyStatsRequest) => ["api-player-enemy-stats", params] as const,
    matchMetadata: (matchId: number, source: MatchMetadataSource = "any") =>
      ["api-tracker-match-metadata", matchId, source] as const,
    matchSummary: (matchId: number) => ["api-match-summary", matchId] as const,
    abilities: () => ["api-tracker-abilities"] as const,
    ingestStatus: (accountId: number) => ["api-player-ingest-status", accountId] as const,
  },
  patron: {
    all: ["patron"] as const,
    status: () => [...queryKeys.patron.all, "status"] as const,
    steamAccounts: () => [...queryKeys.patron.all, "steam-accounts"] as const,
    botFriendStatus: (steamId3: number) => [...queryKeys.patron.all, "bot-friend", steamId3] as const,
  },
} as const;
