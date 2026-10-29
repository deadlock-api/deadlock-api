CREATE MATERIALIZED VIEW default.accounts_to_update_observed_names_mv TO default.accounts_to_update
(
    `account_id` UInt32,
    `last_active` DateTime,
    `last_profile_update` DateTime,
    `last_observed_name_change` DateTime
)
AS SELECT
    account_id,
    toDateTime(0) AS last_active,
    toDateTime(0) AS last_profile_update,
    max(observed_at) AS last_observed_name_change
FROM default.steam_profile_observed_names
GROUP BY account_id;
