CREATE TABLE default.item_flow_totals_agg_staging
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6, 'Internal02' = 7),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `day` Date,
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `n_rows` SimpleAggregateFunction(sum, UInt64),
    `players_state` AggregateFunction(uniqCombined(14), UInt32),
    `sum_kills` SimpleAggregateFunction(sum, UInt64),
    `sum_deaths` SimpleAggregateFunction(sum, UInt64),
    `sum_assists` SimpleAggregateFunction(sum, UInt64),
    `sum_net_worth` SimpleAggregateFunction(sum, UInt64),
    `sum_duration_s` SimpleAggregateFunction(sum, UInt64),
    `n_reached_0` SimpleAggregateFunction(sum, UInt64),
    `n_reached_wins_0` SimpleAggregateFunction(sum, UInt64),
    `n_reached_1` SimpleAggregateFunction(sum, UInt64),
    `n_reached_wins_1` SimpleAggregateFunction(sum, UInt64),
    `n_reached_2` SimpleAggregateFunction(sum, UInt64),
    `n_reached_wins_2` SimpleAggregateFunction(sum, UInt64),
    `n_reached_3` SimpleAggregateFunction(sum, UInt64),
    `n_reached_wins_3` SimpleAggregateFunction(sum, UInt64),
    `built_through` SimpleAggregateFunction(max, DateTime)
)
ENGINE = AggregatingMergeTree
PARTITION BY day
ORDER BY (game_mode, match_mode, day, least_badge, greatest_badge)
SETTINGS index_granularity = 8192;
