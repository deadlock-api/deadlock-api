CREATE MATERIALIZED VIEW default.mv_atu_from_steam_profiles TO default.accounts_to_update
(
    `account_id` UInt32,
    `last_active` DateTime,
    `last_profile_update` DateTime
)
AS SELECT
    account_id,
    toDateTime(0) AS last_active,
    max(last_updated) AS last_profile_update
FROM default.steam_profiles
WHERE account_id > 0
GROUP BY account_id;
