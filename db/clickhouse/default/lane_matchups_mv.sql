CREATE MATERIALIZED VIEW default.lane_matchups_mv TO default.lane_matchups
(
    `match_id` UInt64,
    `assigned_lane` UInt32,
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6, 'Internal02' = 7),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `start_time` DateTime,
    `duration_s` UInt32,
    `average_badge` Nullable(UInt32),
    `team0` Array(UInt8),
    `team1` Array(UInt8),
    `team0_won` Bool,
    `team1_won` Bool,
    `sample_times_s` Array(UInt32),
    `net_worth_team0` Array(UInt32),
    `net_worth_team1` Array(UInt32),
    `kills_team0` Array(UInt16),
    `kills_team1` Array(UInt16),
    `deaths_team0` Array(UInt16),
    `deaths_team1` Array(UInt16),
    `assists_team0` Array(UInt16),
    `assists_team1` Array(UInt16),
    `denies_team0` Array(UInt16),
    `denies_team1` Array(UInt16),
    `creep_kills_team0` Array(UInt16),
    `creep_kills_team1` Array(UInt16),
    `player_damage_team0` Array(UInt32),
    `player_damage_team1` Array(UInt32),
    `level_team0` Array(UInt16),
    `level_team1` Array(UInt16)
)
AS SELECT
    match_id,
    assigned_lane,
    game_mode,
    match_mode,
    start_time,
    duration_s,
    average_badge,
    team0,
    team1,
    team0_won,
    team1_won,
    arrayFilter(t -> (arraySum(p -> arrayCount(x -> (x = t), p.2), players) = 4), arraySort(arrayDistinct(arrayFlatten(arrayMap(p -> (p.2), players))))) AS sample_times_s,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.3, p.2), 0), players), sample_times_s), 'Array(UInt32)') AS net_worth_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.3, p.2)), players), sample_times_s), 'Array(UInt32)') AS net_worth_team1,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.4, p.2), 0), players), sample_times_s), 'Array(UInt16)') AS kills_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.4, p.2)), players), sample_times_s), 'Array(UInt16)') AS kills_team1,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.5, p.2), 0), players), sample_times_s), 'Array(UInt16)') AS deaths_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.5, p.2)), players), sample_times_s), 'Array(UInt16)') AS deaths_team1,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.6, p.2), 0), players), sample_times_s), 'Array(UInt16)') AS assists_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.6, p.2)), players), sample_times_s), 'Array(UInt16)') AS assists_team1,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.7, p.2), 0), players), sample_times_s), 'Array(UInt16)') AS denies_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.7, p.2)), players), sample_times_s), 'Array(UInt16)') AS denies_team1,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.8, p.2), 0), players), sample_times_s), 'Array(UInt16)') AS creep_kills_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.8, p.2)), players), sample_times_s), 'Array(UInt16)') AS creep_kills_team1,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.9, p.2), 0), players), sample_times_s), 'Array(UInt32)') AS player_damage_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.9, p.2)), players), sample_times_s), 'Array(UInt32)') AS player_damage_team1,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, arraySum((v, x) -> if(x = t, v, 0), p.10, p.2), 0), players), sample_times_s), 'Array(UInt16)') AS level_team0,
    CAST(arrayMap(t -> arraySum(p -> if(p.1, 0, arraySum((v, x) -> if(x = t, v, 0), p.10, p.2)), players), sample_times_s), 'Array(UInt16)') AS level_team1
FROM
(
    WITH
        arrayMap(time_stamp_s -> (((time_stamp_s <= 900) AND ((time_stamp_s % 180) = 0)) OR ((time_stamp_s > 900) AND ((time_stamp_s % 300) = 0))), `stats.time_stamp_s`) AS on_grid
    SELECT
        match_id,
        assigned_lane,
        game_mode,
        match_mode,
        start_time,
        duration_s,
        average_badge,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team0')) AS team0,
        arraySort(groupUniqArrayIf(hero_id, team = 'Team1')) AS team1,
        anyIf(won, team = 'Team0') AS team0_won,
        anyIf(won, team = 'Team1') AS team1_won,
        groupArray((team = 'Team0', arrayFilter((v, k) -> k, `stats.time_stamp_s`, on_grid), arrayFilter((v, k) -> k, `stats.net_worth`, on_grid), arrayFilter((v, k) -> k, `stats.kills`, on_grid), arrayFilter((v, k) -> k, `stats.deaths`, on_grid), arrayFilter((v, k) -> k, `stats.assists`, on_grid), arrayFilter((v, k) -> k, `stats.denies`, on_grid), arrayFilter((v, k) -> k, `stats.creep_kills`, on_grid), arrayFilter((v, k) -> k, `stats.player_damage`, on_grid), arrayFilter((v, k) -> k, `stats.level`, on_grid))) AS players
    FROM default.match_player
    WHERE (team IN ('Team0', 'Team1')) AND (assigned_lane > 0) AND (account_id != 0)
    GROUP BY
        match_id,
        assigned_lane,
        game_mode,
        match_mode,
        start_time,
        duration_s,
        average_badge
    HAVING (length(team0) = 2) AND (length(team1) = 2)
);
