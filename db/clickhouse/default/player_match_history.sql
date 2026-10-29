CREATE TABLE default.player_match_history
(
    `account_id` UInt32 COMMENT 'Account ID of the Player' STATISTICS(tdigest),
    `match_id` UInt64 CODEC(Delta(8), ZSTD(1)) STATISTICS(tdigest),
    `hero_id` UInt8 STATISTICS(tdigest),
    `hero_level` UInt32 STATISTICS(tdigest),
    `start_time` DateTime CODEC(Delta(4), ZSTD(1)),
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'INTERNAL' = 6),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `player_team` Enum8('Team0' = 0, 'Team1' = 1, 'Spectator' = 16) COMMENT 'player team id',
    `player_kills` UInt32 STATISTICS(tdigest),
    `player_deaths` UInt32 STATISTICS(tdigest),
    `player_assists` UInt32 STATISTICS(tdigest),
    `denies` UInt32 STATISTICS(tdigest),
    `net_worth` UInt32 STATISTICS(tdigest),
    `last_hits` UInt32 STATISTICS(tdigest),
    `abandoned_time_s` Nullable(UInt32) STATISTICS(tdigest),
    `match_duration_s` UInt32 STATISTICS(tdigest),
    `match_result` UInt32 COMMENT 'the winning team id' STATISTICS(tdigest),
    `objectives_mask_team0` UInt32 STATISTICS(tdigest),
    `objectives_mask_team1` UInt32 STATISTICS(tdigest),
    `brawl_score_team0` Nullable(UInt32) STATISTICS(tdigest),
    `brawl_score_team1` Nullable(UInt32) STATISTICS(tdigest),
    `brawl_avg_round_time_s` Nullable(UInt32) STATISTICS(tdigest),
    `source` Enum8('history_fetcher' = 1, 'match_player' = 2) DEFAULT 'history_fetcher',
    `created_at` DateTime DEFAULT now() CODEC(Delta(4), ZSTD(1)),
    `won` Bool MATERIALIZED player_team = match_result,
    `player_match_outcome` Enum8('Invalid' = 0, 'Win' = 1, 'Loss' = 2, 'Penalized' = 3, 'PenalizedParty' = 4, 'NotScored' = 5) DEFAULT 'Invalid',
    `ranked_display_badge` Nullable(UInt32) DEFAULT NULL COMMENT 'Rank badge the player left the match with, as reported by the game coordinator. Badge = tier * 10 + subrank; tiers (badge / 10): 0 Obscurus, 1 Initiate, 2 Seeker, 3 Acolyte, 4 Sentinel, 5 Mystic, 6 Ritualist, 7 Emissary, 8 Oracle, 9 Phantom, 10 Ascendant, 11 Eternus; subranks (badge % 10): 1-6 (I-VI), e.g. 116 = Eternus VI. Within Eternus the GC keeps extrapolating the progress ladder, so values >= 111 can be wrong and even exceed 116 (e.g. 121, 134); match_player.player_rank_initial_display_rank holds the real Eternus subrank. 0 while the player is in placement games, NULL outside ranked matches. See https://api.deadlock-api.com/v1/assets/ranks',
    `ranked_delta` Nullable(Int32) DEFAULT NULL COMMENT 'Rank progress change the match awarded, in flat progress points (1000 = one subrank step). NULL outside ranked matches.',
    `ranked_calibration_match` Nullable(UInt32) DEFAULT NULL,
    `ranked_used_demotion_protection` Nullable(Bool) DEFAULT NULL,
    `low_pri_pool` Nullable(Bool) DEFAULT NULL COMMENT 'Whether the match was played in the low priority pool, as reported by the game coordinator. NULL for rows written before 2026-10-20 until the account history is fetched again.'
)
ENGINE = CoalescingMergeTree
PARTITION BY tuple()
ORDER BY (account_id, match_id)
SETTINGS index_granularity = 8192, deduplicate_merge_projection_mode = 'rebuild', auto_statistics_types = 'tdigest, basic, uniq, countmin', min_age_to_force_merge_seconds = 86400;
