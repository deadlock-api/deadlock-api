CREATE TABLE default.lane_matchups
(
    `match_id` UInt64,
    `assigned_lane` UInt32,
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `start_time` DateTime,
    `duration_s` UInt32,
    `average_badge` Nullable(UInt32) COMMENT 'match_player.average_badge. Badge = tier * 10 + subrank; tiers (badge / 10): 0 Obscurus, 1 Initiate, 2 Seeker, 3 Acolyte, 4 Sentinel, 5 Mystic, 6 Ritualist, 7 Emissary, 8 Oracle, 9 Phantom, 10 Ascendant, 11 Eternus; subranks (badge % 10): 1-6 (I-VI), e.g. 116 = Eternus VI. NULL outside ranked matches.',
    `team0` Array(UInt8),
    `team1` Array(UInt8),
    `team0_won` Bool,
    `team1_won` Bool,
    `sample_times_s` Array(UInt32) CODEC(Delta(4), ZSTD(1)),
    `net_worth_team0` Array(UInt64) CODEC(ZSTD(1)),
    `net_worth_team1` Array(UInt64) CODEC(ZSTD(1))
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(start_time)
ORDER BY (game_mode, assigned_lane, match_id)
SETTINGS index_granularity = 8192, min_age_to_force_merge_seconds = 3600, min_age_to_force_merge_on_partition_only = 1;
