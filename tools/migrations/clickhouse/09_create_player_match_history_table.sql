create table default.player_match_history
(
    account_id            UInt32 comment 'Account ID of the Player',
    match_id              UInt64 CODEC (Delta, ZSTD),
    hero_id               UInt32,
    hero_level            UInt32,
    start_time            DateTime CODEC (Delta, ZSTD),
    game_mode             Enum8('OneVsOneTest' = 2, 'Normal' = 1, 'Invalid' = 0, 'Sandbox' = 3, 'StreetBrawl' = 4),
    match_mode            Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'Calibration' = 8),
    player_team           Enum8('Team0' = 0, 'Team1' = 1, 'Spectator' = 16) comment 'player team id',
    player_kills          UInt32,
    player_deaths         UInt32,
    player_assists        UInt32,
    denies                UInt32,
    net_worth             UInt32,
    last_hits             UInt32,
    team_abandoned        Nullable(Bool),
    abandoned_time_s      Nullable(UInt32),
    match_duration_s      UInt32,
    match_result          UInt32 comment 'the winning team id',
    objectives_mask_team0 UInt32,
    objectives_mask_team1 UInt32,
    brawl_score_team0      Nullable(UInt32),
    brawl_score_team1      Nullable(UInt32),
    brawl_avg_round_time_s Nullable(UInt32),
    source                Enum8('history_fetcher' = 1, 'match_player' = 2) default 'history_fetcher',
    created_at            DateTime                                         default now() CODEC (Delta, ZSTD),
    username              Nullable(String) CODEC (ZSTD(1)),
    won                   BOOL MATERIALIZED player_team = match_result,

    PROJECTION by_match_id (SELECT _part_offset ORDER BY match_id, account_id)
)
    engine = ReplacingMergeTree PARTITION BY (toStartOfMonth(start_time), match_mode)
        ORDER BY (account_id, match_id)
        SETTINGS index_granularity = 8192, deduplicate_merge_projection_mode = 'rebuild', auto_statistics_types = 'tdigest, minmax, uniq, countmin';
