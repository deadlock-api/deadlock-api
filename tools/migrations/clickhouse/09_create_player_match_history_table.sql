create table if not exists player_match_history
(
 account_id            UInt32 comment 'Account ID of the Player',
 match_id              UInt64,
 hero_id               UInt32,
 hero_level            UInt32,
 start_time            DateTime,
 game_mode             Enum8('OneVsOneTest' = 2, 'Normal' = 1, 'Invalid' = 0, 'Sandbox' = 3),
 match_mode            Enum8('Unranked' = 1, 'CoopBot' = 3, 'Tutorial' = 6, 'HeroLabs' = 7, 'PrivateLobby' = 2, 'ServerTest' = 5, 'Ranked' = 4, 'Invalid' = 0, 'Calibration' = 8),
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
 source                Enum8('history_fetcher' = 1, 'match_player' = 2) default 'history_fetcher',
 created_at            Nullable(DateTime)                               default now(),
 username              Nullable(String),

 INDEX idx_match_id match_id TYPE minmax
)
 engine = ReplacingMergeTree
  PARTITION BY (toStartOfMonth(start_time), match_mode)
  ORDER BY (toStartOfMonth(start_time), match_mode, account_id, match_id);
