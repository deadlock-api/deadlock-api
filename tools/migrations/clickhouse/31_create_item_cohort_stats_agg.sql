-- Cohort rollups for item_stats `include_item_ids` queries ("stats for all
-- items among players who also bought item X"). These are the single biggest
-- base-table load: the hasAll cohort filter matches ~18% of rows spread across
-- every granule, so nothing prunes and each call scans the full time window
-- (~700 of the daily 20s timeouts).
--
-- Same pattern as item_stats_agg, with a cohort_item_id dimension and a
-- per-purchase bucket dimension instead of hero/team/badge:
--   - cohort_item_id comes from the RAW items.item_id array (abilities
--     included, distinct per row), exactly matching hasAll presence semantics
--     for a single include_item_ids value.
--   - the purchase side reads the upgrades.* materialized columns
--     (migration 30), which already encode `is upgrade AND buy_time > 0`.
--
-- Two views because the bucket dimension differs:
--   - time grain (minute) serves: no_bucket, start_time_day/week/month,
--     game_time_min (coarser group-bys merge the states correctly).
--   - net-worth grain (step 1000) serves: net_worth_by_1000/2000/3000/5000/
--     10000 (all multiples of 1000, so re-bucketing floor(b/step)*step on the
--     1000-grained bucket is exact).
-- Everything else (hero/team buckets, badge/duration/account/networth/multi-
-- item/exclude filters, sub-day windows, >30d windows) falls back to the base
-- table; routing lives in api/src/routes/v1/analytics/item_stats.rs.
--
-- Horizon is 35 days (not 65 like item_stats_agg): the cohort cross-join makes
-- the hourly refresh ~30x heavier per row than the single-item rollup, and
-- cohort traffic overwhelmingly uses the default 30-day window. Keep in sync
-- with COHORT_MV_HORIZON_DAYS in item_stats.rs.

-- Refreshes are staggered (:20 / :40) so the two cohort recomputes and the
-- item_stats_agg refresh (:00) never run concurrently — each peaks at ~35 GiB.
CREATE MATERIALIZED VIEW IF NOT EXISTS default.item_cohort_stats_time_agg
REFRESH EVERY 1 HOUR OFFSET 20 MINUTE
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `day` Date,
    `cohort_item_id` UInt32,
    `item_id` UInt32,
    `bucket_minute` UInt32,
    `n_matches` SimpleAggregateFunction(sum, UInt64),
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_time` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_rel` SimpleAggregateFunction(sum, Float64),
    `sum_sold_time` SimpleAggregateFunction(sum, UInt64),
    `n_sold` SimpleAggregateFunction(sum, UInt64),
    `sum_sold_rel` SimpleAggregateFunction(sum, Float64),
    `players_state` AggregateFunction(uniq, UInt32)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (game_mode, cohort_item_id, day, item_id, bucket_minute)
AS SELECT
    game_mode,
    toDate(start_time) AS day,
    cohort_item_id,
    item_id,
    toUInt32(floor(buy_time / 60)) AS bucket_minute,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqState(account_id) AS players_state
FROM default.match_player
ARRAY JOIN
    `upgrades.item_id` AS item_id,
    `upgrades.game_time_s` AS buy_time,
    `upgrades.sold_time_s` AS sold_time
ARRAY JOIN arrayDistinct(items.item_id) AS cohort_item_id
WHERE match_mode IN ('Ranked', 'Unranked')
    AND start_time >= now() - INTERVAL 35 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_minute
SETTINGS max_bytes_before_external_group_by = 20000000000, max_threads = 16, max_execution_time = 1800, log_comment = 'item_cohort_stats_time_agg_refresh';

CREATE MATERIALIZED VIEW IF NOT EXISTS default.item_cohort_stats_net_worth_agg
REFRESH EVERY 1 HOUR OFFSET 40 MINUTE
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `day` Date,
    `cohort_item_id` UInt32,
    `item_id` UInt32,
    `bucket_net_worth` UInt32,
    `n_matches` SimpleAggregateFunction(sum, UInt64),
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_time` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_rel` SimpleAggregateFunction(sum, Float64),
    `sum_sold_time` SimpleAggregateFunction(sum, UInt64),
    `n_sold` SimpleAggregateFunction(sum, UInt64),
    `sum_sold_rel` SimpleAggregateFunction(sum, Float64),
    `players_state` AggregateFunction(uniq, UInt32)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (game_mode, cohort_item_id, day, item_id, bucket_net_worth)
AS SELECT
    game_mode,
    toDate(start_time) AS day,
    cohort_item_id,
    item_id,
    toUInt32(floor(net_worth_at_buy / 1000) * 1000) AS bucket_net_worth,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqState(account_id) AS players_state
FROM default.match_player
ARRAY JOIN
    `upgrades.item_id` AS item_id,
    `upgrades.game_time_s` AS buy_time,
    `upgrades.sold_time_s` AS sold_time,
    `upgrades.net_worth_at_buy` AS net_worth_at_buy
ARRAY JOIN arrayDistinct(items.item_id) AS cohort_item_id
WHERE match_mode IN ('Ranked', 'Unranked')
    AND start_time >= now() - INTERVAL 35 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_net_worth
SETTINGS max_bytes_before_external_group_by = 20000000000, max_threads = 16, max_execution_time = 1800, log_comment = 'item_cohort_stats_net_worth_agg_refresh';

-- The first refresh starts automatically after creation. Monitor with:
--   SELECT view, status, last_refresh_time, exception FROM system.view_refreshes
--   WHERE view LIKE 'item_cohort%';
-- Check sizes once populated:
--   SELECT table, formatReadableSize(sum(bytes_on_disk)), sum(rows)
--   FROM system.parts WHERE active AND table LIKE '%inner%' GROUP BY table;
