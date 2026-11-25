CREATE MATERIALIZED VIEW default.player_hero_match_counts
REFRESH EVERY 30 MINUTE
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'INTERNAL' = 6, 'Internal02' = 7),
    `account_id` UInt32 CODEC(Delta(4), ZSTD(1)),
    `hero_id` UInt8,
    `matches` UInt32 CODEC(T64, LZ4)
)
ENGINE = MergeTree
ORDER BY (game_mode, account_id, hero_id)
SETTINGS index_granularity = 8192
DEFINER = default SQL SECURITY DEFINER
COMMENT 'Entire-history match count per player, hero and game mode (distinct matches in player_match_history), for the hero-stats experience filters. Rebuilt every 30 minutes, so counts lag up to that.'
AS SELECT
    game_mode,
    account_id,
    hero_id,
    toUInt32(count()) AS matches
FROM default.player_match_history
FINAL
WHERE account_id != 0
GROUP BY
    game_mode,
    account_id,
    hero_id
SETTINGS max_threads = 16, max_execution_time = 600, log_comment = 'player_hero_match_counts_refresh';
