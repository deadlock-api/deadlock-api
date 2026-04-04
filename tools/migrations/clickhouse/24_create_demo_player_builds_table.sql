CREATE TABLE IF NOT EXISTS demo_player (
    match_id       UInt64,
    account_id     UInt32,
    hero_id        UInt32,
    hero_build_id  UInt64,
    created_at     DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree
PARTITION BY toStartOfMonth(created_at)
ORDER BY (match_id, account_id);
