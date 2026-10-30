CREATE TABLE default.item_flow_nodes_agg
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6, 'Internal02' = 7),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `day` Date,
    `phase` UInt8,
    `item_id` UInt32,
    `nw_bucket` UInt32,
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `n_buys` SimpleAggregateFunction(sum, UInt64),
    `n_players` SimpleAggregateFunction(sum, UInt64),
    `sum_kills` SimpleAggregateFunction(sum, UInt64),
    `sum_deaths` SimpleAggregateFunction(sum, UInt64),
    `sum_assists` SimpleAggregateFunction(sum, UInt64),
    `sum_net_worth_at_buy` SimpleAggregateFunction(sum, UInt64),
    `built_through` SimpleAggregateFunction(max, DateTime)
)
ENGINE = AggregatingMergeTree
PARTITION BY day
ORDER BY (game_mode, match_mode, day, least_badge, greatest_badge, phase, item_id, nw_bucket)
SETTINGS index_granularity = 8192;
