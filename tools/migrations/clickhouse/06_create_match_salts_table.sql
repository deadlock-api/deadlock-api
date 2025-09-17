CREATE TABLE match_salts
(
    match_id      UInt64,
    cluster_id    Nullable(UInt32),
    metadata_salt Nullable(UInt32),
    replay_salt   Nullable(UInt32),
    created_at    DateTime         DEFAULT now(),
    username      Nullable(String)
)
 ENGINE = CoalescingMergeTree()
  PARTITION BY toStartOfMonth(created_at)
  ORDER BY (toStartOfMonth(created_at), match_id);
