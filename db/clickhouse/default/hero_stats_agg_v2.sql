CREATE MATERIALIZED VIEW default.hero_stats_agg_v2
REFRESH EVERY 1 HOUR
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `hero_id` UInt8,
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `day` Date,
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
    `sum_first_permanent_buff_time_s` SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (game_mode, match_mode, day, hero_id, least_badge, greatest_badge)
SETTINGS index_granularity = 8192
DEFINER = default SQL SECURITY DEFINER
AS SELECT
    game_mode,
    match_mode,
    hero_id,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    toDate(start_time) AS day,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(kills) AS sum_kills,
    sum(deaths) AS sum_deaths,
    sum(assists) AS sum_assists,
    sum(net_worth) AS sum_net_worth,
    sum(last_hits) AS sum_last_hits,
    sum(denies) AS sum_denies,
    sum(max_player_damage) AS sum_player_damage,
    sum(max_player_damage_taken) AS sum_player_damage_taken,
    sum(max_boss_damage) AS sum_boss_damage,
    sum(max_creep_damage) AS sum_creep_damage,
    sum(max_neutral_damage) AS sum_neutral_damage,
    sum(max_max_health) AS sum_max_health,
    sum(max_shots_hit) AS sum_shots_hit,
    sum(max_shots_missed) AS sum_shots_missed,
    sum(permanent_buffs) AS sum_permanent_buffs,
    count(first_permanent_buff_time_s) AS n_permanent_buff_timing_matches,
    sum(ifNull(first_permanent_buff_time_s, 0)) AS sum_first_permanent_buff_time_s
FROM
(
    SELECT
        game_mode,
        match_mode,
        hero_id,
        match_id,
        start_time,
        average_badge,
        won,
        kills,
        deaths,
        assists,
        net_worth,
        last_hits,
        denies,
        max_player_damage,
        max_player_damage_taken,
        max_boss_damage,
        max_creep_damage,
        max_neutral_damage,
        max_max_health,
        max_shots_hit,
        max_shots_missed,
        account_id,
        permanent_buffs,
        first_permanent_buff_time_s
    FROM default.match_player
    WHERE (match_mode IN ('Ranked', 'Unranked')) AND (start_time >= (now() - toIntervalDay(65)))
    LIMIT 1 BY
        match_id,
        account_id
)
GROUP BY
    game_mode,
    match_mode,
    hero_id,
    least_badge,
    greatest_badge,
    day
SETTINGS max_bytes_before_external_group_by = 20000000000, max_threads = 16, max_execution_time = 1800, log_comment = 'hero_stats_agg_v2_refresh';
