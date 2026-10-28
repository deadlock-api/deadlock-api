DROP TABLE IF EXISTS heroes;

CREATE TABLE IF NOT EXISTS heroes
(
 id   UInt16,
 name String
) ENGINE = ReplacingMergeTree ORDER BY (id);
