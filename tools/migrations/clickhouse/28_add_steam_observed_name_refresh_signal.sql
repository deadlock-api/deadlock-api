ALTER TABLE accounts_to_update
    ADD COLUMN IF NOT EXISTS last_observed_name_change SimpleAggregateFunction(max, DateTime) DEFAULT toDateTime(0);

CREATE TABLE IF NOT EXISTS steam_profile_observed_names
(
    account_id          UInt32,
    observed_name       String CODEC(ZSTD(1)),
    match_id            UInt64,
    observed_at         DateTime CODEC(Delta, ZSTD)
)
ENGINE = ReplacingMergeTree(observed_at)
PARTITION BY toStartOfMonth(observed_at)
ORDER BY (account_id, observed_name);

CREATE MATERIALIZED VIEW IF NOT EXISTS accounts_to_update_observed_names_mv
TO accounts_to_update
AS
SELECT
    account_id,
    toDateTime(0) AS last_active,
    toDateTime(0) AS last_profile_update,
    max(observed_at) AS last_observed_name_change
FROM steam_profile_observed_names
GROUP BY account_id;
