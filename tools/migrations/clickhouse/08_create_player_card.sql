DROP TABLE IF EXISTS player_card;
CREATE TABLE IF NOT EXISTS player_card
(
 account_id         UInt32,
 ranked_badge_level Nullable(UInt32),
 slots_slots_id     Array(Nullable(UInt32)),
 slots_hero_id      Array(Nullable(UInt32)),
 slots_hero_kills   Array(Nullable(UInt32)),
 slots_hero_wins    Array(Nullable(UInt32)),
 slots_stat_id      Array(Nullable(Int32)),
 slots_stat_score   Array(Nullable(UInt32)),
 created_at         DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree ORDER BY (account_id, created_at);
