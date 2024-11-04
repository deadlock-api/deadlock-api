DROP VIEW IF EXISTS player;
CREATE MATERIALIZED VIEW player
REFRESH EVERY 10 MINUTES
ENGINE = MergeTree() ORDER BY account_id
POPULATE AS
SELECT DISTINCT account_id
FROM match_player
UNION DISTINCT
SELECT DISTINCT players.account_id
FROM active_matches
   ARRAY JOIN players
 ORDER BY `players.account_id`
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
