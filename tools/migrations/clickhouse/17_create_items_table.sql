DROP TABLE IF EXISTS items;

CREATE TABLE IF NOT EXISTS items
(
 id   UInt32,
 name String,
 tier UInt8
) ENGINE = ReplacingMergeTree ORDER BY (id);
