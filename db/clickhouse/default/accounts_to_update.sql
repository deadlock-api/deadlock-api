CREATE TABLE default.accounts_to_update
(
    `account_id` UInt32,
    `last_active` SimpleAggregateFunction(max, DateTime),
    `last_profile_update` SimpleAggregateFunction(max, DateTime),
    `last_observed_name_change` SimpleAggregateFunction(max, DateTime) DEFAULT toDateTime(0)
)
ENGINE = AggregatingMergeTree
ORDER BY account_id
SETTINGS index_granularity = 8192, min_age_to_force_merge_seconds = 3600;
