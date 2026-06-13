DROP TABLE IF EXISTS default.item_cohort_stats_time_agg;
DROP TABLE IF EXISTS default.item_cohort_stats_net_worth_agg;

CREATE TABLE IF NOT EXISTS default.item_cohort_stats_time_agg
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
PARTITION BY day
ORDER BY (game_mode, cohort_item_id, day, item_id, bucket_minute);

CREATE TABLE IF NOT EXISTS default.item_cohort_stats_net_worth_agg
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
PARTITION BY day
ORDER BY (game_mode, cohort_item_id, day, item_id, bucket_net_worth);

CREATE TABLE IF NOT EXISTS default.item_cohort_stats_time_agg_staging AS default.item_cohort_stats_time_agg;
CREATE TABLE IF NOT EXISTS default.item_cohort_stats_net_worth_agg_staging AS default.item_cohort_stats_net_worth_agg;

GRANT SHOW TABLES, SHOW COLUMNS, SHOW DICTIONARIES, SELECT ON default.item_cohort_stats_time_agg TO api_readonly_user;
GRANT SHOW TABLES, SHOW COLUMNS, SHOW DICTIONARIES, SELECT ON default.item_cohort_stats_net_worth_agg TO api_readonly_user;

TRUNCATE TABLE default.item_cohort_stats_time_agg;
TRUNCATE TABLE default.item_cohort_stats_net_worth_agg;

INSERT INTO default.item_cohort_stats_time_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 35 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 28 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_minute
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_time_agg_backfill';

INSERT INTO default.item_cohort_stats_time_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 28 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 21 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_minute
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_time_agg_backfill';

INSERT INTO default.item_cohort_stats_time_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 21 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 14 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_minute
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_time_agg_backfill';

INSERT INTO default.item_cohort_stats_time_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 14 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 7 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_minute
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_time_agg_backfill';

INSERT INTO default.item_cohort_stats_time_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 7 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_minute
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_time_agg_backfill';

INSERT INTO default.item_cohort_stats_net_worth_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 35 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 28 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_net_worth
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_net_worth_agg_backfill';

INSERT INTO default.item_cohort_stats_net_worth_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 28 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 21 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_net_worth
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_net_worth_agg_backfill';

INSERT INTO default.item_cohort_stats_net_worth_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 21 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 14 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_net_worth
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_net_worth_agg_backfill';

INSERT INTO default.item_cohort_stats_net_worth_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 14 DAY
    AND start_time < toStartOfDay(now()) - INTERVAL 7 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_net_worth
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_net_worth_agg_backfill';

INSERT INTO default.item_cohort_stats_net_worth_agg
SELECT
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
    AND start_time >= toStartOfDay(now()) - INTERVAL 7 DAY
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, bucket_net_worth
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_cohort_stats_net_worth_agg_backfill';
