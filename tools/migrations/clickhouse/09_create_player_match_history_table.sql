CREATE TABLE IF NOT EXISTS player_match_history
(
    account_id UInt32,
    match_id UInt32,
    hero_id UInt32,
    hero_level UInt32,
    start_time DateTime,
    game_mode Enum8 (
        'Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3
    ),
    match_mode Enum8 (
        'Invalid' = 0,
        'Unranked' = 1,
        'PrivateLobby' = 2,
        'CoopBot' = 3,
        'Ranked' = 4,
        'ServerTest' = 5,
        'Tutorial' = 6
    ),
    player_team Enum8 ('Team0' = 0, 'Team1' = 1, 'Spectator' = 16),
    player_kills UInt32,
    player_deaths UInt32,
    player_assists UInt32,
    denies UInt32,
    net_worth UInt32,
    last_hits UInt32,
    team_abandoned bool,
    abandoned_time_s UInt32,
    match_duration_s UInt32,
    match_result UInt32,
    objectives_mask_team0 UInt32,
    objectives_mask_team1 UInt32
) ENGINE = ReplacingMergeTree ORDER BY (account_id, match_id);
