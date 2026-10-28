create table hero_leaderboard
(
    fetched_at           DateTime default now() CODEC (Delta, ZSTD),
    region               Enum8('Europe' = 1, 'Asia' = 2, 'NAmerica' = 3, 'SAmerica' = 4, 'Oceania' = 5),
    hero_id              UInt32,
    account_name         Nullable(String) CODEC (ZSTD(1)),
    rank                 UInt32 CODEC (Delta, ZSTD),
    leaderboard_position UInt32,
    top_hero_ids         Array(UInt32),
    badge_level          Nullable(UInt32)
)
    engine = ReplacingMergeTree
        PARTITION BY toYYYYMMDD(fetched_at)
        ORDER BY (region, hero_id, toStartOfHour(fetched_at), rank, leaderboard_position);
