DROP VIEW IF EXISTS hero_player_winrate;
CREATE MATERIALIZED VIEW hero_player_winrate
REFRESH EVERY 10 MINUTES
ENGINE = MergeTree() ORDER BY (hero_id, account_id)
POPULATE AS
SELECT `players.hero_id` as hero_id, `players.account_id` as account_id, SUM(winner == `players.team`) AS wins, COUNT() AS total
FROM finished_matches
      ARRAY JOIN players
GROUP BY hero_id, account_id
HAVING total >= 10
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
