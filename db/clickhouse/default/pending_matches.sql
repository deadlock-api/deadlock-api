CREATE TABLE default.pending_matches
(
    `match_id` UInt64 CODEC(Delta(8), ZSTD(1)),
    `state` Enum8('pending' = 0, 'done' = 1),
    `updated_at` DateTime DEFAULT now() CODEC(Delta(4), ZSTD(1)),
    `start_time` DateTime CODEC(Delta(4), ZSTD(1)),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'INTERNAL' = 6, 'Internal02' = 7),
    `badge` UInt32 COMMENT 'Rank badge used to prioritize fetching the match: player_match_history.ranked_display_badge (0 when unknown), or 111 (Eternus I) for matches seen in active_matches. Badge = tier * 10 + subrank; tiers (badge / 10): 0 Obscurus, 1 Initiate, 2 Seeker, 3 Acolyte, 4 Sentinel, 5 Mystic, 6 Ritualist, 7 Emissary, 8 Oracle, 9 Phantom, 10 Ascendant, 11 Eternus; subranks (badge % 10): 1-6 (I-VI).'
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY intDiv(match_id, 10000000)
ORDER BY match_id
SETTINGS index_granularity = 8192;
