DROP VIEW IF EXISTS player_region;
CREATE MATERIALIZED VIEW player_region
REFRESH EVERY 10 MINUTES
ENGINE = MergeTree() ORDER BY account_id
POPULATE AS
SELECT DISTINCT
 ON (`players.account_id`)  `players.account_id` as account_id, region_mode
 FROM finished_matches
 ARRAY JOIN players
 ORDER BY `players.account_id`
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
