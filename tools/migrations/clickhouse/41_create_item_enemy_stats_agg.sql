-- Item stats per enemy hero: every purchase row is fanned out once per hero on the
-- opposing team. Serves /v1/analytics/item-stats?enemy_hero_ids=X, whose base-table
-- query decompresses the item arrays of the whole window (~25 CPU-s per request).
-- Kept fresh per day partition by api/src/services/cohort_agg_refresh.rs.
CREATE TABLE IF NOT EXISTS default.item_enemy_stats_agg
(
    `game_mode` Enum8('Invalid' = 0, 'Normal' = 1, 'OneVsOneTest' = 2, 'Sandbox' = 3, 'StreetBrawl' = 4, 'ExploreNYC' = 5, 'Internal' = 6),
    `match_mode` Enum8('Invalid' = 0, 'Unranked' = 1, 'PrivateLobby' = 2, 'CoopBot' = 3, 'Ranked' = 4, 'ServerTest' = 5, 'Tutorial' = 6, 'HeroLabs' = 7, 'NewPlayerPlacement' = 8),
    `day` Date,
    `enemy_hero_id` UInt8,
    `least_badge` UInt16,
    `greatest_badge` UInt16,
    `item_id` UInt32,
    `n_matches` SimpleAggregateFunction(sum, UInt64),
    `n_wins` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_time` SimpleAggregateFunction(sum, UInt64),
    `sum_buy_rel` SimpleAggregateFunction(sum, Float64),
    `sum_sold_time` SimpleAggregateFunction(sum, UInt64),
    `n_sold` SimpleAggregateFunction(sum, UInt64),
    `sum_sold_rel` SimpleAggregateFunction(sum, Float64),
    `players_state` AggregateFunction(uniqCombined(14), UInt32)
)
ENGINE = AggregatingMergeTree
PARTITION BY day
PRIMARY KEY (game_mode, enemy_hero_id, day, item_id)
ORDER BY (game_mode, enemy_hero_id, day, item_id, least_badge, greatest_badge, match_mode);

CREATE TABLE IF NOT EXISTS default.item_enemy_stats_agg_staging AS default.item_enemy_stats_agg;

GRANT SHOW TABLES, SHOW COLUMNS, SHOW DICTIONARIES, SELECT ON default.item_enemy_stats_agg TO api_readonly_user;

-- Backfill the 65-day horizon in 13-day chunks (~50s / ~8 GiB each).
TRUNCATE TABLE default.item_enemy_stats_agg;

INSERT INTO default.item_enemy_stats_agg
SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    enemy_hero_id,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    CAST(upgrade_item_id, 'UInt32') AS item_id,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqCombinedState(14)(account_id) AS players_state
FROM (
    SELECT
        game_mode, match_mode, start_time, average_badge, won, duration_s, account_id,
        `upgrades.item_id` AS item_ids,
        `upgrades.game_time_s` AS buy_times,
        `upgrades.sold_time_s` AS sold_times,
        arrayJoin(enemies.enemy_hero_ids) AS enemy_hero_id
    FROM default.match_player AS buyers
    INNER JOIN (
        SELECT match_id, team AS enemy_team, groupUniqArray(hero_id) AS enemy_hero_ids
        FROM default.match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND team IN ('Team0', 'Team1')
            AND start_time >= toStartOfDay(now()) - INTERVAL 13 DAY
        GROUP BY match_id, team
    ) AS enemies ON enemies.match_id = buyers.match_id
        AND enemies.enemy_team = if(buyers.team = 'Team0', 'Team1', 'Team0')
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND start_time >= toStartOfDay(now()) - INTERVAL 13 DAY
        AND duration_s > 0
)
ARRAY JOIN
    item_ids AS upgrade_item_id,
    buy_times AS buy_time,
    sold_times AS sold_time
GROUP BY game_mode, match_mode, day, enemy_hero_id, least_badge, greatest_badge, item_id
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_enemy_stats_agg_backfill';

INSERT INTO default.item_enemy_stats_agg
SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    enemy_hero_id,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    CAST(upgrade_item_id, 'UInt32') AS item_id,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqCombinedState(14)(account_id) AS players_state
FROM (
    SELECT
        game_mode, match_mode, start_time, average_badge, won, duration_s, account_id,
        `upgrades.item_id` AS item_ids,
        `upgrades.game_time_s` AS buy_times,
        `upgrades.sold_time_s` AS sold_times,
        arrayJoin(enemies.enemy_hero_ids) AS enemy_hero_id
    FROM default.match_player AS buyers
    INNER JOIN (
        SELECT match_id, team AS enemy_team, groupUniqArray(hero_id) AS enemy_hero_ids
        FROM default.match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND team IN ('Team0', 'Team1')
            AND start_time >= toStartOfDay(now()) - INTERVAL 26 DAY AND start_time < toStartOfDay(now()) - INTERVAL 13 DAY
        GROUP BY match_id, team
    ) AS enemies ON enemies.match_id = buyers.match_id
        AND enemies.enemy_team = if(buyers.team = 'Team0', 'Team1', 'Team0')
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND start_time >= toStartOfDay(now()) - INTERVAL 26 DAY AND start_time < toStartOfDay(now()) - INTERVAL 13 DAY
        AND duration_s > 0
)
ARRAY JOIN
    item_ids AS upgrade_item_id,
    buy_times AS buy_time,
    sold_times AS sold_time
GROUP BY game_mode, match_mode, day, enemy_hero_id, least_badge, greatest_badge, item_id
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_enemy_stats_agg_backfill';

INSERT INTO default.item_enemy_stats_agg
SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    enemy_hero_id,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    CAST(upgrade_item_id, 'UInt32') AS item_id,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqCombinedState(14)(account_id) AS players_state
FROM (
    SELECT
        game_mode, match_mode, start_time, average_badge, won, duration_s, account_id,
        `upgrades.item_id` AS item_ids,
        `upgrades.game_time_s` AS buy_times,
        `upgrades.sold_time_s` AS sold_times,
        arrayJoin(enemies.enemy_hero_ids) AS enemy_hero_id
    FROM default.match_player AS buyers
    INNER JOIN (
        SELECT match_id, team AS enemy_team, groupUniqArray(hero_id) AS enemy_hero_ids
        FROM default.match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND team IN ('Team0', 'Team1')
            AND start_time >= toStartOfDay(now()) - INTERVAL 39 DAY AND start_time < toStartOfDay(now()) - INTERVAL 26 DAY
        GROUP BY match_id, team
    ) AS enemies ON enemies.match_id = buyers.match_id
        AND enemies.enemy_team = if(buyers.team = 'Team0', 'Team1', 'Team0')
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND start_time >= toStartOfDay(now()) - INTERVAL 39 DAY AND start_time < toStartOfDay(now()) - INTERVAL 26 DAY
        AND duration_s > 0
)
ARRAY JOIN
    item_ids AS upgrade_item_id,
    buy_times AS buy_time,
    sold_times AS sold_time
GROUP BY game_mode, match_mode, day, enemy_hero_id, least_badge, greatest_badge, item_id
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_enemy_stats_agg_backfill';

INSERT INTO default.item_enemy_stats_agg
SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    enemy_hero_id,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    CAST(upgrade_item_id, 'UInt32') AS item_id,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqCombinedState(14)(account_id) AS players_state
FROM (
    SELECT
        game_mode, match_mode, start_time, average_badge, won, duration_s, account_id,
        `upgrades.item_id` AS item_ids,
        `upgrades.game_time_s` AS buy_times,
        `upgrades.sold_time_s` AS sold_times,
        arrayJoin(enemies.enemy_hero_ids) AS enemy_hero_id
    FROM default.match_player AS buyers
    INNER JOIN (
        SELECT match_id, team AS enemy_team, groupUniqArray(hero_id) AS enemy_hero_ids
        FROM default.match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND team IN ('Team0', 'Team1')
            AND start_time >= toStartOfDay(now()) - INTERVAL 52 DAY AND start_time < toStartOfDay(now()) - INTERVAL 39 DAY
        GROUP BY match_id, team
    ) AS enemies ON enemies.match_id = buyers.match_id
        AND enemies.enemy_team = if(buyers.team = 'Team0', 'Team1', 'Team0')
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND start_time >= toStartOfDay(now()) - INTERVAL 52 DAY AND start_time < toStartOfDay(now()) - INTERVAL 39 DAY
        AND duration_s > 0
)
ARRAY JOIN
    item_ids AS upgrade_item_id,
    buy_times AS buy_time,
    sold_times AS sold_time
GROUP BY game_mode, match_mode, day, enemy_hero_id, least_badge, greatest_badge, item_id
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_enemy_stats_agg_backfill';

INSERT INTO default.item_enemy_stats_agg
SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    enemy_hero_id,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    CAST(upgrade_item_id, 'UInt32') AS item_id,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqCombinedState(14)(account_id) AS players_state
FROM (
    SELECT
        game_mode, match_mode, start_time, average_badge, won, duration_s, account_id,
        `upgrades.item_id` AS item_ids,
        `upgrades.game_time_s` AS buy_times,
        `upgrades.sold_time_s` AS sold_times,
        arrayJoin(enemies.enemy_hero_ids) AS enemy_hero_id
    FROM default.match_player AS buyers
    INNER JOIN (
        SELECT match_id, team AS enemy_team, groupUniqArray(hero_id) AS enemy_hero_ids
        FROM default.match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND team IN ('Team0', 'Team1')
            AND start_time >= toStartOfDay(now()) - INTERVAL 65 DAY AND start_time < toStartOfDay(now()) - INTERVAL 52 DAY
        GROUP BY match_id, team
    ) AS enemies ON enemies.match_id = buyers.match_id
        AND enemies.enemy_team = if(buyers.team = 'Team0', 'Team1', 'Team0')
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND start_time >= toStartOfDay(now()) - INTERVAL 65 DAY AND start_time < toStartOfDay(now()) - INTERVAL 52 DAY
        AND duration_s > 0
)
ARRAY JOIN
    item_ids AS upgrade_item_id,
    buy_times AS buy_time,
    sold_times AS sold_time
GROUP BY game_mode, match_mode, day, enemy_hero_id, least_badge, greatest_badge, item_id
SETTINGS max_bytes_before_external_group_by = 8000000000, max_threads = 8, max_memory_usage = 16106127360, log_comment = 'item_enemy_stats_agg_backfill';
