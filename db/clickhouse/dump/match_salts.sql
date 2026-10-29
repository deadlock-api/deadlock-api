CREATE VIEW dump.match_salts
(
    `match_id` UInt64,
    `cluster_id` Nullable(UInt32),
    `metadata_salt` Nullable(UInt32),
    `replay_salt` Nullable(UInt32),
    `created_at` DateTime
)
SQL SECURITY INVOKER
AS SELECT
    match_id,
    cluster_id,
    metadata_salt,
    replay_salt,
    created_at
FROM default.match_salts;
