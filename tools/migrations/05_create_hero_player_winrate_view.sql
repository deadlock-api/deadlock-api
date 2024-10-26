DROP VIEW IF EXISTS hero_player_winrate;
CREATE MATERIALIZED VIEW hero_player_winrate
REFRESH EVERY 10 MINUTES
ENGINE = MergeTree() ORDER BY (hero_id, account_id)
POPULATE AS
WITH match_hero_account_win AS (
 SELECT hero_id, account_id, mi.winning_team == team AS win
 FROM match_player
       INNER JOIN match_info mi USING (match_id)

 UNION ALL

 SELECT `players.hero_id` as hero_id, `players.account_id` as account_id, winner == `players.team` AS win
 FROM finished_matches
       ARRAY JOIN players
 WHERE match_id NOT IN (SELECT match_id FROM match_info)
)
SELECT hero_id, account_id, SUM(win) AS wins, COUNT() AS total
FROM match_hero_account_win
GROUP BY hero_id, account_id
HAVING total >= 10
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
