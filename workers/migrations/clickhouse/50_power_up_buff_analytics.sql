-- Power-up buff pickup analytics (build 6712, "City Never Sleeps").
--
-- Run order:
--   1. Statements 1-4 BEFORE deploying the API that reads the new columns and views. They are
--      metadata-only (no part is rewritten) except that creating the two views runs their
--      first refresh.
--   2. Wait for that first refresh:
--        SYSTEM WAIT VIEW hero_stats_agg_v2;
--        SYSTEM WAIT VIEW hero_stats_agg_all_v2;
--   3. Deploy the API.
--   4. Statement 5 (drop the superseded v1 rollups) once no deployed API reads them.
--   5. Recommended, off-peak, any time after statement 2: the MATERIALIZE COLUMN mutation at the
--      end of statement 2, so old parts store the buff scalars instead of computing them from
--      the arrays on every read.

-- 1. Timing defaults that do not read `power_up_buffs.type`.
--
-- `pickup_times_s` / `pickup_stat_values` were added after most parts were written. On those
-- parts ClickHouse evaluates the column DEFAULT at read time, and the old default
-- `arrayResize([[]], length(power_up_buffs.type))` decompresses the wide `type` strings
-- (~49 GiB uncompressed table-wide). Sizing from `is_permanent` (~1.5 GiB) yields the same
-- arrays. Measured on a 7-day game-stats read: permanent pickup counts alone 563 MiB, counts
-- plus first-pickup times 1.51 GiB with the old default (clickhouse-local, 200k rows: reading
-- the timing column from an old part 271 MB with the old default, 8 MB with this one).
-- Changing only a DEFAULT expression is metadata-only (no mutation).
ALTER TABLE match_player
    MODIFY COLUMN `power_up_buffs.pickup_times_s` DEFAULT arrayResize([[]], length(`power_up_buffs.is_permanent`)),
    MODIFY COLUMN `power_up_buffs.pickup_stat_values` DEFAULT arrayResize([[]], length(`power_up_buffs.is_permanent`));

-- 2. Per-player buff scalars on match_player, like the existing max_* MATERIALIZED columns:
--   permanent_buffs              permanent pickups of the player in the match (all builds)
--   first_permanent_buff_time_s  game time of the first permanent pickup, NULL without a timed
--                                permanent pickup (every pre-6712 match)
-- New parts store them on insert; old parts compute them from the arrays at read time until the
-- MATERIALIZE COLUMN mutation below has run (clickhouse-local, 200k rows: 28 MB -> 1 MB read).
ALTER TABLE match_player
    ADD COLUMN IF NOT EXISTS permanent_buffs UInt32
        MATERIALIZED toUInt32(arraySum(arrayMap((v, p) -> if(p, v, 0), `power_up_buffs.value`, `power_up_buffs.is_permanent`))),
    ADD COLUMN IF NOT EXISTS first_permanent_buff_time_s Nullable(UInt32)
        MATERIALIZED if(
            empty(arrayFlatten(arrayFilter((t, p) -> p, `power_up_buffs.pickup_times_s`, `power_up_buffs.is_permanent`))),
            NULL,
            arrayMin(arrayFlatten(arrayFilter((t, p) -> p, `power_up_buffs.pickup_times_s`, `power_up_buffs.is_permanent`)))
        );

-- Recommended, off-peak (rewrites only these two small columns in every part; run after the
-- statement above, can run after the API deploy):
-- ALTER TABLE match_player MATERIALIZE COLUMN permanent_buffs;
-- ALTER TABLE match_player MATERIALIZE COLUMN first_permanent_buff_time_s;

-- 3. The same scalars on player_match_stats, for the account-scoped analytics paths
-- (/v1/analytics/hero-stats with account_ids, /v1/players/hero-stats). Rows written before
-- this migration stay NULL; the API counts only non-NULL rows in its buff denominators.
-- Optional backfill (heavy, off-peak): re-insert older rows from match_player through the
-- view's SELECT.
ALTER TABLE player_match_stats
    ADD COLUMN IF NOT EXISTS permanent_buffs Nullable(UInt32) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS first_permanent_buff_time_s Nullable(UInt32) DEFAULT NULL;

ALTER TABLE player_match_stats_mv MODIFY QUERY
SELECT
    account_id, match_id, hero_id, won, kills, deaths, assists, denies, net_worth, last_hits,
    player_level, max_level, max_player_damage, max_player_damage_taken, max_damage_mitigated,
    max_creep_kills, max_neutral_kills, max_boss_damage, max_creep_damage, max_neutral_damage,
    max_max_health, max_shots_hit, max_shots_missed, max_hero_bullets_hit,
    max_hero_bullets_hit_crit, duration_s, start_time, average_badge, match_mode, game_mode,
    player_rank_initial_display_rank, player_rank_initial_flat_progress,
    player_rank_final_flat_progress, player_rank_desired_progress_change,
    player_rank_initial_calibration_games, player_rank_initial_demotion_protection_games,
    player_rank_consumed_demotion_protection, player_rank_initial_win_streak, mvp_rank,
    permanent_buffs, first_permanent_buff_time_s
FROM default.match_player;

-- 4. Hero-stats rollups with buff pickup sums. Same grain, refresh cadence and horizon as the
-- v1 views (hero_stats_agg: last 65 days, hourly; hero_stats_agg_all: full history, 6-hourly),
-- plus:
--   sum_permanent_buffs              permanent pickups (every row has counts)
--   n_permanent_buff_timing_matches  player-matches with >= 1 timed permanent pickup (6712+)
--   sum_first_permanent_buff_time_s  sum of those players' first-pickup game times
-- A refreshable view cannot gain columns in place (ALTER ... MODIFY QUERY rejects new columns),
-- hence new names.
CREATE MATERIALIZED VIEW IF NOT EXISTS hero_stats_agg_v2
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
        game_mode, match_mode, hero_id, match_id, start_time, average_badge, won, kills, deaths,
        assists, net_worth, last_hits, denies, max_player_damage, max_player_damage_taken,
        max_boss_damage, max_creep_damage, max_neutral_damage, max_max_health, max_shots_hit,
        max_shots_missed, account_id,
        permanent_buffs, first_permanent_buff_time_s
    FROM default.match_player
    WHERE (match_mode IN ('Ranked', 'Unranked')) AND (start_time >= (now() - toIntervalDay(65)))
    LIMIT 1 BY match_id, account_id
)
GROUP BY game_mode, match_mode, hero_id, least_badge, greatest_badge, day
SETTINGS max_bytes_before_external_group_by = 20000000000, max_threads = 16, max_execution_time = 1800, log_comment = 'hero_stats_agg_v2_refresh';

CREATE MATERIALIZED VIEW IF NOT EXISTS hero_stats_agg_all_v2
REFRESH EVERY 6 HOUR
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
        game_mode, match_mode, hero_id, match_id, start_time, average_badge, won, kills, deaths,
        assists, net_worth, last_hits, denies, max_player_damage, max_player_damage_taken,
        max_boss_damage, max_creep_damage, max_neutral_damage, max_max_health, max_shots_hit,
        max_shots_missed, account_id,
        permanent_buffs, first_permanent_buff_time_s
    FROM default.match_player
    WHERE match_mode IN ('Ranked', 'Unranked')
    LIMIT 1 BY match_id, account_id
)
GROUP BY game_mode, match_mode, hero_id, least_badge, greatest_badge, day
SETTINGS max_bytes_before_external_group_by = 20000000000, max_threads = 16, max_execution_time = 1800, log_comment = 'hero_stats_agg_all_v2_refresh';

-- 5. AFTER the API reading the _v2 views is deployed everywhere:
-- DROP VIEW IF EXISTS hero_stats_agg;
-- DROP VIEW IF EXISTS hero_stats_agg_all;
