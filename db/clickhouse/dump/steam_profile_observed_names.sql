CREATE VIEW dump.steam_profile_observed_names
(
    `account_id` UInt32,
    `observed_name` String,
    `match_id` UInt64,
    `observed_at` DateTime
)
SQL SECURITY INVOKER
AS SELECT
    account_id,
    observed_name,
    match_id,
    observed_at
FROM default.steam_profile_observed_names;
