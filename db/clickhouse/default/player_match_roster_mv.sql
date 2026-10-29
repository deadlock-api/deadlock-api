CREATE MATERIALIZED VIEW default.player_match_roster_mv TO default.player_match_roster
(
    `account_id` UInt32,
    `match_id` UInt64,
    `start_time` DateTime,
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'INTERNAL' = 6),
    `match_duration_s` UInt32,
    `won` Bool,
    `mate_ids` Array(UInt32),
    `enemy_ids` Array(UInt32)
)
AS WITH
    per_match AS
    (
        SELECT
            match_id,
            any(start_time) AS start_time,
            any(game_mode) AS game_mode,
            any(match_duration_s) AS match_duration_s,
            groupUniqArray((account_id, player_team, won)) AS roster
        FROM default.player_match_history
        WHERE (source = 'match_player') AND (match_mode IN ('Ranked', 'Unranked')) AND (player_team IN ('Team0', 'Team1'))
        GROUP BY match_id
    )
SELECT
    r.1 AS account_id,
    match_id,
    start_time,
    game_mode,
    match_duration_s,
    r.3 AS won,
    arrayFilter(x -> (x != (r.1)), arrayMap(p -> (p.1), arrayFilter(p -> ((p.2) = (r.2)), roster))) AS mate_ids,
    arrayMap(p -> (p.1), arrayFilter(p -> ((p.2) != (r.2)), roster)) AS enemy_ids
FROM per_match
ARRAY JOIN roster AS r;
