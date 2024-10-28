CREATE TABLE IF NOT EXISTS match_salts
(
    match_id UInt64,
    cluster_id Nullable (UInt32),
    metadata_salt Nullable (UInt32),
    replay_salt Nullable (UInt32),
    failed Bool DEFAULT FALSE
) ENGINE = ReplacingMergeTree ORDER BY (match_id);
