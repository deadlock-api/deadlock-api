DROP TABLE player_card;
CREATE TABLE player_card (
    account_id UInt32,
    ranked_badge_level UInt32,
    slots_slots_id Array (UInt32),
    slots_hero_id Array (UInt32),
    slots_hero_kills Array (UInt32),
    slots_hero_wins Array (UInt32),
    slots_stat_id Array (UInt32),
    slots_stat_score Array (UInt32),
    created_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree ORDER BY (account_id, created_at);
