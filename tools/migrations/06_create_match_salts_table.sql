CREATE TABLE IF NOT EXISTS match_salts
(
    match_id UInt64,
    cluster_id UInt32,
    metadata_salt UInt32,
    replay_salt UInt32
) ENGINE = ReplacingMergeTree ORDER BY (match_id);
