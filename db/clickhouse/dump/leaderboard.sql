CREATE VIEW dump.leaderboard
(
    `fetched_at` DateTime,
    `region` Enum8('Europe' = 1, 'Asia' = 2, 'NAmerica' = 3, 'SAmerica' = 4, 'Oceania' = 5),
    `account_name` Nullable(String),
    `rank` UInt32,
    `leaderboard_position` UInt32,
    `top_hero_ids` Array(UInt8)
)
SQL SECURITY INVOKER
AS SELECT
    fetched_at,
    region,
    account_name,
    rank,
    leaderboard_position,
    top_hero_ids
FROM default.leaderboard;
