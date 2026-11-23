CREATE TABLE default.hero_stats_duration_agg
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6, 'Internal02' = 7),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `day` Date,
    `duration_key` UInt16,
    `hero_id` UInt8,
    `n_matches` SimpleAggregateFunction(sum, UInt64),
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `sum_kills` SimpleAggregateFunction(sum, UInt64),
    `sum_deaths` SimpleAggregateFunction(sum, UInt64),
    `sum_assists` SimpleAggregateFunction(sum, UInt64),
    `sum_net_worth` SimpleAggregateFunction(sum, UInt64),
    `sum_last_hits` SimpleAggregateFunction(sum, UInt64),
    `sum_denies` SimpleAggregateFunction(sum, UInt64),
    `sum_player_damage` SimpleAggregateFunction(sum, UInt64),
    `sum_player_damage_taken` SimpleAggregateFunction(sum, UInt64),
    `sum_boss_damage` SimpleAggregateFunction(sum, UInt64),
    `sum_creep_damage` SimpleAggregateFunction(sum, UInt64),
    `sum_neutral_damage` SimpleAggregateFunction(sum, UInt64),
    `sum_max_health` SimpleAggregateFunction(sum, UInt64),
    `sum_shots_hit` SimpleAggregateFunction(sum, UInt64),
    `sum_shots_missed` SimpleAggregateFunction(sum, UInt64),
    `sum_permanent_buffs` SimpleAggregateFunction(sum, UInt64),
    `n_permanent_buff_timing_matches` SimpleAggregateFunction(sum, UInt64),
    `sum_first_permanent_buff_time_s` SimpleAggregateFunction(sum, UInt64),
    `built_through` SimpleAggregateFunction(max, DateTime)
)
ENGINE = AggregatingMergeTree
PARTITION BY day
ORDER BY (game_mode, match_mode, day, least_badge, greatest_badge, duration_key, hero_id)
SETTINGS index_granularity = 8192;
