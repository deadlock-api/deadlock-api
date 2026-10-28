-- item_stats_agg, incrementally refreshed.
--
-- The refreshable MV `item_stats_agg` recomputed its whole 65-day window every hour
-- (~720 CPU-s and ~19 GiB peak per refresh, ~36k CPU-s per 48h, the costliest refresh
-- job on the server). `item_stats_agg_v2` holds the same rows, partitioned by day, and is
-- kept fresh by api/src/services/cohort_agg_refresh.rs like the cohort and enemy rollups:
-- a day is rebuilt only once its source match count grew by ~2%, so a cycle rebuilds the
-- current day and the few days still receiving late matches.
--
-- The job builds its rows with `item_stats_agg_rows` in
-- api/src/routes/v1/analytics/item_stats.rs. It inserts by position, so the column
-- order here must stay the grain columns of `ITEM_STATS_AGG` followed by the measures.

CREATE TABLE IF NOT EXISTS default.item_stats_agg_v2
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `item_id` UInt32,
    `hero_id` UInt8,
    `team` Enum8('Team0' = 0, 'Team1' = 1, 'Spectator' = 16),
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `day` Date,
    `n_matches` SimpleAggregateFunction(sum, UInt64),
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_time` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_rel` SimpleAggregateFunction(sum, Float64),
    `sum_sold_time` SimpleAggregateFunction(sum, UInt64),
    `n_sold` SimpleAggregateFunction(sum, UInt64),
    `sum_sold_rel` SimpleAggregateFunction(sum, Float64),
    `players_state` AggregateFunction(uniqCombined(14), UInt32)
)
ENGINE = AggregatingMergeTree
PARTITION BY day
ORDER BY (game_mode, match_mode, day, hero_id, least_badge, greatest_badge, item_id, team);

CREATE TABLE IF NOT EXISTS default.item_stats_agg_v2_staging AS default.item_stats_agg_v2;

GRANT SHOW TABLES, SHOW COLUMNS, SHOW DICTIONARIES, SELECT ON default.item_stats_agg_v2 TO api_readonly_user;

-- Seed with the MV's current rows (~25M rows, seconds), so the API can read v2 from the
-- first deploy. The job has no recorded state for v2 yet, so its first cycle rebuilds every
-- day of the horizon from match_player anyway, which also replaces the MV's partial
-- oldest day.
TRUNCATE TABLE default.item_stats_agg_v2;
INSERT INTO default.item_stats_agg_v2 SELECT * FROM default.item_stats_agg;

-- After the API reads v2 and the job's first cycle has rebuilt every day
-- (SELECT count() FROM default.cohort_agg_refresh_state FINAL WHERE table_name = 'default.item_stats_agg_v2'
-- returns 65 or 66), drop the hourly full recompute:
--   DROP VIEW default.item_stats_agg;
