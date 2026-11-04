CREATE TABLE default.item_flow_brawl_nodes_inc_agg
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6, 'Internal02' = 7),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `day` Date,
    `include_item_id` UInt32,
    `phase` UInt8,
    `item_id` UInt32,
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
ORDER BY (game_mode, match_mode, include_item_id, phase, item_id)
SETTINGS index_granularity = 8192, default_compression_codec = 'ZSTD(1)';
