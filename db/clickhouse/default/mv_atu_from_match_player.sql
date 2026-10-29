CREATE MATERIALIZED VIEW default.mv_atu_from_match_player TO default.accounts_to_update
(
    `account_id` UInt32,
    `last_active` DateTime,
    `last_profile_update` DateTime
)
AS SELECT
    account_id,
    max(start_time) AS last_active,
    toDateTime(0) AS last_profile_update
FROM default.match_player
WHERE account_id > 0
GROUP BY account_id;
