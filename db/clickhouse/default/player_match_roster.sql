CREATE TABLE default.player_match_roster
(
    `account_id` UInt32,
    `match_id` UInt64,
    `start_time` DateTime,
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `match_duration_s` UInt32,
    `won` Bool,
    `mate_ids` Array(UInt32),
    `enemy_ids` Array(UInt32)
)
ENGINE = ReplacingMergeTree
PARTITION BY tuple()
ORDER BY (account_id, match_id)
SETTINGS index_granularity = 8192, min_age_to_force_merge_seconds = 86400;
