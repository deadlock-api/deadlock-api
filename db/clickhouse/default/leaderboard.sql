CREATE TABLE default.leaderboard
(
    `fetched_at` DateTime DEFAULT now() CODEC(Delta(4), ZSTD(1)),
    `region` Enum8('Europe' = 1, 'Asia' = 2, 'NAmerica' = 3, 'SAmerica' = 4, 'Oceania' = 5),
    `account_name` Nullable(String) CODEC(ZSTD(1)),
    `rank` UInt32 CODEC(Delta(4), ZSTD(1)),
    `leaderboard_position` UInt32,
    `top_hero_ids` Array(UInt8)
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMMDD(fetched_at)
ORDER BY (region, toStartOfHour(fetched_at), rank, leaderboard_position)
SETTINGS index_granularity = 8192;
