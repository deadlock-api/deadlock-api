DROP TABLE IF EXISTS items;

CREATE TABLE IF NOT EXISTS items
(
 id   UInt32,
 name String,
 tier Nullable(UInt8),
 type Enum8 (
  'upgrade' = 0,
  'ability' = 1,
 )
) ENGINE = ReplacingMergeTree ORDER BY (id);
