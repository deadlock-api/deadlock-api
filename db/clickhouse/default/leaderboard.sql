CREATE TABLE default.leaderboard
(
    `fetched_at` DateTime DEFAULT now() CODEC(Delta(4), ZSTD(1)),
    `region` Enum8('Europe' = 1, 'Asia' = 2, 'NAmerica' = 3, 'SAmerica' = 4, 'Oceania' = 5),
    `account_name` Nullable(String) CODEC(ZSTD(1)),
    `rank` UInt32 COMMENT 'Place on the leaderboard as the game sends it, starting at 1. Players can share a place, and the following places are then skipped (1, 2, 2, 4). Not a rank badge.' CODEC(Delta(4), ZSTD(1)),
    `leaderboard_position` UInt32 COMMENT 'Index of the entry in the list the game sends, starting at 1 and unique within a snapshot.',
    `top_hero_ids` Array(UInt8)
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMMDD(fetched_at)
ORDER BY (region, toStartOfHour(fetched_at), rank, leaderboard_position)
SETTINGS index_granularity = 8192;
