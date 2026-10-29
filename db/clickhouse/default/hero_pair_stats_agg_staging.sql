CREATE TABLE default.hero_pair_stats_agg_staging
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `day` Date,
    `enemy` UInt8,
    `same_lane` UInt8,
    `hero_id` UInt8,
    `other_hero_id` UInt8,
    `n_pairs` SimpleAggregateFunction(sum, UInt64),
    `wins` SimpleAggregateFunction(sum, UInt64),
    `kills` SimpleAggregateFunction(sum, UInt64),
    `other_kills` SimpleAggregateFunction(sum, UInt64),
    `deaths` SimpleAggregateFunction(sum, UInt64),
    `other_deaths` SimpleAggregateFunction(sum, UInt64),
    `assists` SimpleAggregateFunction(sum, UInt64),
    `other_assists` SimpleAggregateFunction(sum, UInt64),
    `denies` SimpleAggregateFunction(sum, UInt64),
    `other_denies` SimpleAggregateFunction(sum, UInt64),
    `last_hits` SimpleAggregateFunction(sum, UInt64),
    `other_last_hits` SimpleAggregateFunction(sum, UInt64),
    `net_worth` SimpleAggregateFunction(sum, UInt64),
    `other_net_worth` SimpleAggregateFunction(sum, UInt64),
    `obj_damage` SimpleAggregateFunction(sum, UInt64),
    `other_obj_damage` SimpleAggregateFunction(sum, UInt64),
    `creeps` SimpleAggregateFunction(sum, UInt64),
    `other_creeps` SimpleAggregateFunction(sum, UInt64),
    `built_through` SimpleAggregateFunction(max, DateTime)
)
ENGINE = AggregatingMergeTree
PARTITION BY day
ORDER BY (game_mode, match_mode, enemy, same_lane, day, least_badge, greatest_badge, hero_id, other_hero_id)
SETTINGS index_granularity = 8192;
