CREATE TABLE default.item_permutation_pairs_agg_staging
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6, 'Internal02' = 7),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `day` Date,
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `item_a` UInt32 CODEC(T64, ZSTD(3)),
    `item_b` UInt32 CODEC(T64, ZSTD(3)),
    `n_matches` SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(3)),
    `n_wins` SimpleAggregateFunction(sum, UInt64) CODEC(T64, ZSTD(3)),
    `built_through` SimpleAggregateFunction(max, DateTime) DEFAULT 0
)
ENGINE = AggregatingMergeTree
PARTITION BY day
ORDER BY (game_mode, day, match_mode, least_badge, greatest_badge, item_a, item_b)
SETTINGS index_granularity = 8192;
