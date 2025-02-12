DROP TABLE IF EXISTS finished_matches;

CREATE TABLE finished_matches
(
    start_time DateTime,
    winning_team UInt8,
    match_id UInt64,
    players Nested (
        account_id UInt64,
        team UInt8,
        abandoned Bool,
        hero_id UInt8
    ),
    lobby_id String,
    net_worth_team_0 UInt32,
    net_worth_team_1 UInt32,
    duration_s UInt32,
    spectators UInt32,
    open_spectator_slots UInt32,
    objectives_mask_team0 UInt16,
    objectives_mask_team1 UInt16,
    match_mode Enum8 (
        'Invalid' = 0,
        'Unranked' = 1,
        'PrivateLobby' = 2,
        'CoopBot' = 3,
        'Ranked' = 4,
        'ServerTest' = 5,
        'Tutorial' = 6,
        'HeroLabs' = 7
    ),
    game_mode Enum8 (
        'Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3
    ),
    match_score UInt32,
    region_mode Enum8 (
        'Row' = 0,
        'Europe' = 1,
        'SEAsia' = 2,
        'SAmerica' = 3,
        'Russia' = 4,
        'Oceania' = 5
    ),
    scraped_at DateTime64,
    team0_core Bool,
    team0_tier1_lane1 Bool,
    team0_tier2_lane1 Bool,
    team0_tier1_lane2 Bool,
    team0_tier2_lane2 Bool,
    team0_tier1_lane3 Bool,
    team0_tier2_lane3 Bool,
    team0_tier1_lane4 Bool,
    team0_tier2_lane4 Bool,
    team0_titan Bool,
    team0_titan_shield_generator_1 Bool,
    team0_titan_shield_generator_2 Bool,
    team0_barrack_boss_lane1 Bool,
    team0_barrack_boss_lane2 Bool,
    team0_barrack_boss_lane3 Bool,
    team0_barrack_boss_lane4 Bool,
    team1_core Bool,
    team1_tier1_lane1 Bool,
    team1_tier2_lane1 Bool,
    team1_tier1_lane2 Bool,
    team1_tier2_lane2 Bool,
    team1_tier1_lane3 Bool,
    team1_tier2_lane3 Bool,
    team1_tier1_lane4 Bool,
    team1_tier2_lane4 Bool,
    team1_titan Bool,
    team1_titan_shield_generator_1 Bool,
    team1_titan_shield_generator_2 Bool,
    team1_barrack_boss_lane1 Bool,
    team1_barrack_boss_lane2 Bool,
    team1_barrack_boss_lane3 Bool,
    team1_barrack_boss_lane4 Bool,
    winner UInt8,
    sign Int8
)
ENGINE = VersionedCollapsingMergeTree(sign, scraped_at)
ORDER BY match_id;

DROP VIEW IF EXISTS finished_matches_mv;
CREATE MATERIALIZED VIEW finished_matches_mv TO finished_matches
AS
SELECT
    active_matches.start_time,
    active_matches.winning_team,
    active_matches.match_id,
    players.hero_id AS `players.hero_id`,
    players.account_id AS `players.account_id`,
    players.team AS `players.team`,
    `players.abandoned`,
    active_matches.lobby_id,
    active_matches.net_worth_team_0,
    active_matches.net_worth_team_1,
    active_matches.duration_s,
    active_matches.spectators,
    active_matches.open_spectator_slots,
    active_matches.objectives_mask_team0,
    active_matches.objectives_mask_team1,
    active_matches.match_mode,
    active_matches.game_mode,
    active_matches.match_score,
    active_matches.region_mode,
    active_matches.scraped_at,
    active_matches.team0_core,
    active_matches.team0_tier1_lane1,
    active_matches.team0_tier2_lane1,
    active_matches.team0_tier1_lane2,
    active_matches.team0_tier2_lane2,
    active_matches.team0_tier1_lane3,
    active_matches.team0_tier2_lane3,
    active_matches.team0_tier1_lane4,
    active_matches.team0_tier2_lane4,
    active_matches.team0_titan,
    active_matches.team0_titan_shield_generator_1,
    active_matches.team0_titan_shield_generator_2,
    active_matches.team0_barrack_boss_lane1,
    active_matches.team0_barrack_boss_lane2,
    active_matches.team0_barrack_boss_lane3,
    active_matches.team0_barrack_boss_lane4,
    active_matches.team1_core,
    active_matches.team1_tier1_lane1,
    active_matches.team1_tier2_lane1,
    active_matches.team1_tier1_lane2,
    active_matches.team1_tier2_lane2,
    active_matches.team1_tier1_lane3,
    active_matches.team1_tier2_lane3,
    active_matches.team1_tier1_lane4,
    active_matches.team1_tier2_lane4,
    active_matches.team1_titan,
    active_matches.team1_titan_shield_generator_1,
    active_matches.team1_titan_shield_generator_2,
    active_matches.team1_barrack_boss_lane1,
    active_matches.team1_barrack_boss_lane2,
    active_matches.team1_barrack_boss_lane3,
    active_matches.team1_barrack_boss_lane4,
    1 AS sign,
    CASE
        WHEN active_matches.team0_core AND NOT active_matches.team1_core THEN 0
        WHEN active_matches.team1_core AND NOT active_matches.team0_core THEN 1
        WHEN
            active_matches.team0_titan AND NOT active_matches.team1_titan
            THEN 0
        WHEN
            active_matches.team1_titan AND NOT active_matches.team0_titan
            THEN 1
        WHEN
            active_matches.team0_titan_shield_generator_1
            + active_matches.team0_titan_shield_generator_2
            > active_matches.team1_titan_shield_generator_1
            + active_matches.team1_titan_shield_generator_2
            + 1
            THEN 0
        WHEN
            active_matches.team1_titan_shield_generator_1
            + active_matches.team1_titan_shield_generator_2
            > active_matches.team0_titan_shield_generator_1
            + active_matches.team0_titan_shield_generator_2
            + 1
            THEN 1
        WHEN
            active_matches.net_worth_team_0
            > active_matches.net_worth_team_1 + 15000
            THEN 0
        WHEN
            active_matches.net_worth_team_1
            > active_matches.net_worth_team_0 + 15000
            THEN 1
    END AS winner
FROM active_matches
WHERE winner IS NOT NULL;
