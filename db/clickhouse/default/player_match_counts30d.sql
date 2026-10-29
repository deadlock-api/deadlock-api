CREATE MATERIALIZED VIEW default.player_match_counts30d
REFRESH EVERY 30 MINUTE
(
    `account_id` UInt32,
    `matches_played` UInt64,
    `last_team_avg_badge` Nullable(UInt32)
)
ENGINE = MergeTree
ORDER BY account_id
SETTINGS index_granularity = 256
DEFINER = default SQL SECURITY DEFINER
AS SELECT
    account_id,
    uniq(match_id) AS matches_played,
    argMax(if(team = 'Team0', average_badge_team0, average_badge_team1), match_id) AS last_team_avg_badge
FROM default.match_player
WHERE (start_time > (now() - toIntervalDay(30))) AND (account_id != 0) AND (match_mode IN ('Ranked', 'Unranked')) AND (game_mode = 'Normal')
GROUP BY account_id;
