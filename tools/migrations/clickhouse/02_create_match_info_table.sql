create table default.match_info
(
    match_id                    UInt64 CODEC (Delta, ZSTD),
    start_time                  DateTime CODEC (Delta, ZSTD),
    winning_team                Enum8('Team0' = 0, 'Spectator' = 16, 'Team1' = 1),
    duration_s                  UInt32,
    match_outcome               Enum8('TeamWin' = 0, 'Error' = 1),
    match_mode                  Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'Calibration' = 8),
    game_mode                   Enum8('OneVsOneTest' = 2, 'Normal' = 1, 'Invalid' = 0, 'Sandbox' = 3),
    objectives_mask_team0       UInt16,
    objectives_mask_team1       UInt16,
    objectives                  Nested(destroyed_time_s UInt32,
                                    creep_damage UInt32,
                                    creep_damage_mitigated UInt32,
                                    player_damage UInt32,
                                    player_damage_mitigated UInt32,
                                    first_damage_time_s UInt32,
                                    team_objective Enum8 (
                                        'Core' = 0, 'Tier1Lane1' = 1, 'Tier1Lane2' = 2, 'Tier1Lane3' = 3, 'Tier1Lane4' = 4, 'Tier2Lane1' = 5, 'Tier2Lane2' = 6, 'Tier2Lane3' = 7, 'Tier2Lane4' = 8, 'Titan' = 9, 'TitanShieldGenerator1' = 10, 'TitanShieldGenerator2' = 11, 'BarrackBossLane1' = 12, 'BarrackBossLane2' = 13, 'BarrackBossLane3' = 14, 'BarrackBossLane4' = 15),
                                    team Enum8 ('Team0' = 0, 'Team1' = 1, 'Spectator' = 16)),
    mid_boss                    Nested(team_killed Enum8 ('Team0' = 0, 'Team1' = 1, 'Spectator' = 16),
                                    team_claimed Enum8 ('Team0' = 0, 'Team1' = 1, 'Spectator' = 16),
                                    destroyed_time_s UInt32),
    is_high_skill_range_parties Nullable(Bool),
    low_pri_pool                Nullable(Bool),
    new_player_pool             Nullable(Bool),
    average_badge_team0         Nullable(UInt32),
    average_badge_team1         Nullable(UInt32),
    rewards_eligible            Bool           default false,
    not_scored                  Nullable(Bool) default NULL,
    created_at                  DateTime       default now() CODEC (Delta, ZSTD),
    game_mode_version           Nullable(UInt32)
)
    engine = ReplacingMergeTree PARTITION BY toStartOfMonth(start_time)
        ORDER BY (toStartOfMonth(start_time), match_mode, match_id)
        SETTINGS index_granularity = 8192, auto_statistics_types = 'tdigest, minmax, uniq, countmin';
