CREATE TABLE IF NOT EXISTS active_matches
(
    start_time            DATETIME,
    winning_team          UInt8,
    match_id              UInt64,
    players               Nested(account_id UInt64,
                              team UInt8,
                              abandoned bool,
                              hero_id UInt8),
    lobby_id              String,
    net_worth_team_0      UInt32,
    net_worth_team_1      UInt32,
    duration_s            UInt32,
    spectators            UInt32,
    open_spectator_slots  UInt32,
    objectives_mask_team0 UInt16,
    objectives_mask_team1 UInt16,
    match_mode            Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6),
    game_mode             Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3),
    match_score           UInt32,
    region_mode           Enum8('Row' = 0, 'Europe' = 1, 'SEAsia' = 2, 'SAmerica' = 3, 'Russia' = 4, 'Oceania' = 5),
    scraped_at            DateTime64 DEFAULT now()
) ENGINE = MergeTree() ORDER BY match_id
      PRIMARY KEY match_id;
