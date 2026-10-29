CREATE TABLE default.item_cohort_stats_time_agg_v2_staging
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
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
    `players_state` AggregateFunction(uniqCombined(14), UInt32),
    `built_through` SimpleAggregateFunction(max, DateTime) DEFAULT 0
)
ENGINE = AggregatingMergeTree
PARTITION BY day
PRIMARY KEY (game_mode, cohort_item_id, day, item_id, bucket_minute)
ORDER BY (game_mode, cohort_item_id, day, item_id, bucket_minute, match_mode)
SETTINGS index_granularity = 8192;
