CREATE TABLE IF NOT EXISTS mmr_history
(
    account_id UInt64,
    match_id UInt64,
    match_mode Enum8 (
        'Invalid' = 0,
        'Unranked' = 1,
        'PrivateLobby' = 2,
        'CoopBot' = 3,
        'Ranked' = 4,
        'ServerTest' = 5,
        'Tutorial' = 6
    ),
    player_score Float64
) ENGINE = ReplacingMergeTree ORDER BY (account_id, match_id);
