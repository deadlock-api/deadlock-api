CREATE MATERIALIZED VIEW default.pending_matches_from_active_mv TO default.pending_matches
(
    `match_id` UInt64,
    `state` String,
    `updated_at` DateTime,
    `start_time` DateTime,
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'INTERNAL' = 6, 'Internal02' = 7),
    `badge` UInt32
)
AS SELECT
    match_id,
    'pending' AS state,
    start_time AS updated_at,
    start_time,
    match_mode,
    game_mode,
    toUInt32(111) AS badge
FROM default.active_matches
WHERE (match_mode IN ('Ranked', 'Unranked')) AND (match_id >= 31247321);
