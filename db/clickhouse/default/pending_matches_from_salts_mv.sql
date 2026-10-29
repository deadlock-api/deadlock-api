CREATE MATERIALIZED VIEW default.pending_matches_from_salts_mv TO default.pending_matches
(
    `match_id` UInt64,
    `state` String,
    `updated_at` DateTime
)
AS SELECT
    match_id,
    'done' AS state,
    created_at AS updated_at
FROM default.match_salts
WHERE (match_id >= 31247321) AND (match_id < 4294967295);
