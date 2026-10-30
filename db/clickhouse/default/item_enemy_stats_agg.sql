CREATE TABLE default.item_enemy_stats_agg
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6, 'Internal02' = 7),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `day` Date,
    `enemy_hero_id` UInt8,
    `least_badge` UInt16 COMMENT 'ifNull(match_player.average_badge, 0): average badge for range filters, 0 for matches without one so they match any lower bound. Badge = tier * 10 + subrank; tiers (badge / 10): 0 Obscurus, 1 Initiate, 2 Seeker, 3 Acolyte, 4 Sentinel, 5 Mystic, 6 Ritualist, 7 Emissary, 8 Oracle, 9 Phantom, 10 Ascendant, 11 Eternus; subranks (badge % 10): 1-6 (I-VI).',
    `greatest_badge` UInt16 COMMENT 'ifNull(match_player.average_badge, 65535): average badge for range filters, 65535 for matches without one so they match any upper bound. Badge = tier * 10 + subrank; tiers (badge / 10): 0 Obscurus, 1 Initiate, 2 Seeker, 3 Acolyte, 4 Sentinel, 5 Mystic, 6 Ritualist, 7 Emissary, 8 Oracle, 9 Phantom, 10 Ascendant, 11 Eternus; subranks (badge % 10): 1-6 (I-VI).',
    `item_id` UInt32,
    `n_matches` SimpleAggregateFunction(sum, UInt64),
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_time` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_rel` SimpleAggregateFunction(sum, Float64),
    `sum_sold_time` SimpleAggregateFunction(sum, UInt64),
    `n_sold` SimpleAggregateFunction(sum, UInt64),
    `sum_sold_rel` SimpleAggregateFunction(sum, Float64),
    `players_state` AggregateFunction(uniqCombined(14), UInt32),
    `built_through` SimpleAggregateFunction(max, DateTime) DEFAULT 0
)
ENGINE = AggregatingMergeTree
PARTITION BY day
PRIMARY KEY (game_mode, enemy_hero_id, day, item_id)
ORDER BY (game_mode, enemy_hero_id, day, item_id, least_badge, greatest_badge, match_mode)
SETTINGS index_granularity = 8192;
