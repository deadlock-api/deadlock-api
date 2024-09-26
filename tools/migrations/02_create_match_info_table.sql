DROP TABLE IF EXISTS match_info;
CREATE TABLE IF NOT EXISTS match_info
(
    match_id              UInt64,
    start_time            DATETIME,
    winning_team          UInt8,
    duration_s            UInt32,
    match_outcome         UInt8,
    match_mode            Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6),
    game_mode             Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3),
    sample_time_s         Array(UInt16),
    stat_type             Array(UInt8),
    source_name           Array(String),
    objectives_mask_team0 UInt16,
    objectives_mask_team1 UInt16,
    objectives            Nested(destroyed_time_s UInt16,
                              creep_damage UInt32,
                              creep_damage_mitigated UInt32,
                              player_damage UInt32,
                              player_damage_mitigated UInt32,
                              first_damage_time_s UInt16,
                              team_objective_id UInt8,
                              team UInt8),
    mid_boss              Nested(team_killed UInt32,
                              team_claimed UInt32,
                              destroyed_time_s UInt32)
) ENGINE = MergeTree() ORDER BY match_id
      PRIMARY KEY match_id;
