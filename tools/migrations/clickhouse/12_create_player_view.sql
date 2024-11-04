DROP VIEW IF EXISTS player;
CREATE MATERIALIZED VIEW player
REFRESH EVERY 10 MINUTES
ENGINE = MergeTree() ORDER BY account_id
POPULATE AS
SELECT DISTINCT players.account_id as account_id, region_mode
FROM active_matches
      ARRAY JOIN players
UNION DISTINCT
SELECT DISTINCT account_id, NULL as region_mode
FROM match_player
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
