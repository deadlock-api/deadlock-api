-- Store `stats.custom_user_stats` transposed and delta-encoded.
--
-- Before: Array(Map(LowCardinality(String), UInt32)), one map per stats tick, so every
-- tick repeats all ~54 stat names and a stat's values over time lie far apart.
-- After:  Map(LowCardinality(String), Array(Int32)), stat -> one value per stats tick, the
-- first being the value itself and each later one the change since the previous tick.
-- Ticks lacking a stat count as 0. Deltas wrap at 32 bits, so
-- toUInt32(arrayCumSum(deltas)) restores the values exactly.
--
-- Measured on 35k rows of partition 85: -21% on disk here (ZSTD(9)), -40% in the parquet
-- files of the public data lake (zstd level 9).
--
-- Rollout:
--   1. Stage 1 below. The DEFAULT derives the new column from the old one, so ingest
--      workers that still write `stats.custom_user_stats` keep producing it.
--   2. Wait for the mutation (system.mutations, is_done = 1).
--   3. Run the final_stats MODIFY COLUMN of stage 2 (it depends on the old column).
--   4. Deploy the ingest worker and API that read and write `custom_user_stats_deltas`.
--   5. The rest of stage 2. The data dump then rebuilds match_player as a new generation.

-- ── Stage 1 ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE match_player
    ADD COLUMN IF NOT EXISTS custom_user_stats_deltas Map(LowCardinality(String), Array(Int32))
    DEFAULT if(
        arrayAll(m -> mapKeys(m) = mapKeys(`stats.custom_user_stats`[1]), `stats.custom_user_stats`),
        -- Every tick has the keys of the first, in its order (all rows checked so far): sort
        -- the flat tick-major values key-major, delta them, and cut one array per key.
        mapFromArrays(
            mapKeys(`stats.custom_user_stats`[1]),
            arraySplit(
                (x, i) -> (i - 1) % length(`stats.custom_user_stats`) = 0,
                arrayMap(
                    (x, p, i) -> toInt32(if((i - 1) % length(`stats.custom_user_stats`) = 0, x, toInt64(x) - p)),
                    arraySort(
                        (v, i) -> ((i - 1) % length(`stats.custom_user_stats`[1])) * length(`stats.custom_user_stats`)
                            + intDiv(i - 1, length(`stats.custom_user_stats`[1])),
                        arrayFlatten(arrayMap(m -> mapValues(m), `stats.custom_user_stats`)) AS flat,
                        arrayEnumerate(flat)) AS key_major,
                    arraySlice(arrayPushFront(key_major, 0), 1, length(key_major)),
                    arrayEnumerate(key_major)),
                arrayEnumerate(key_major))),
        -- Ticks with differing keys: union of the keys in first-seen order. Quadratic in the
        -- number of keys, so it must stay off the common path (`if` short-circuits).
        mapFromArrays(
            arrayDistinct(arrayFlatten(arrayMap(m -> mapKeys(m), `stats.custom_user_stats`))),
            arrayMap(
                k -> arrayMap(
                    d -> toInt32(d),
                    arrayPopFront(arrayDifference(arrayPushFront(
                        arrayMap(m -> toInt64(m[k]), `stats.custom_user_stats`), 0)))),
                arrayDistinct(arrayFlatten(arrayMap(m -> mapKeys(m), `stats.custom_user_stats`))))))
    CODEC(ZSTD(9))
    COMMENT 'custom stat name -> one value per stats tick (stats.time_stamp_s), delta-encoded: the first element is the value, each later one the change since the previous tick; toUInt32(arrayCumSum(deltas)) restores the values'
    AFTER `stats.custom_user_stats`;

ALTER TABLE match_player MATERIALIZE COLUMN custom_user_stats_deltas;

-- ── Stage 2 (after the mutation finished and the new ingest worker and API are live) ─────

-- match_player carries LowCardinality(UInt32) columns; the view inherits their types.
SET allow_suspicious_low_cardinality_types = 1;

CREATE OR REPLACE VIEW dump.match_player SQL SECURITY INVOKER AS
SELECT
    `match_id`,
    `start_time`,
    `duration_s`,
    `match_mode`,
    `game_mode`,
    `average_badge_team0`,
    `average_badge_team1`,
    `winning_team`,
    `match_outcome`,
    `bot_difficulty`,
    `power_up_buffs.value`,
    `power_up_buffs.is_permanent`,
    `mvp_rank`,
    `player_tracked_stats`,
    `accolades.accolade_id`,
    `accolades.accolade_stat_value`,
    `accolades.accolade_threshold_achieved`,
    `won`,
    `death_details.time_to_kill_s`,
    `hero_xp`,
    `hero_equips`,
    `created_at`,
    `banned_hero_ids`,
    `hero_build_id`,
    `pregame_hero_id`,
    `demo_processed`,
    `ranked_type`,
    `rank_interval`,
    `player_match_outcome`,
    `player_rank_initial_display_rank`,
    `player_rank_initial_flat_progress`,
    `player_rank_final_flat_progress`,
    `player_rank_desired_progress_change`,
    `player_rank_initial_calibration_games`,
    `player_rank_initial_demotion_protection_games`,
    `player_rank_consumed_demotion_protection`,
    `player_rank_initial_win_streak`,
    `hero_xp_rewards.hero_id`,
    `hero_xp_rewards.xp_grant`,
    `hero_xp_rewards.reason`,
    `average_badge`,
    `corrupted_penalty_seed`,
    `power_up_buffs.pickup_times_s`,
    `power_up_buffs.pickup_stat_values`,
    `hero_release_votes.category`,
    `hero_release_votes.hero_id`,
    `hero_release_votes.vote_count`,
    `custom_user_stats_deltas`
FROM default.match_player;

-- final_stats (MATERIALIZED, not in an earlier migration) took its custom_user_stats from
-- `stats.custom_user_stats`[-1]; the sum of the deltas is the same last value. Rows inserted
-- by the new ingest worker before this ran got an empty map there, so their partitions are
-- recomputed: ALTER TABLE match_player MATERIALIZE COLUMN final_stats IN PARTITION <p>, for
-- every p of SELECT DISTINCT intDiv(match_id, 1000000) FROM match_player WHERE
-- empty(final_stats.custom_user_stats) AND notEmpty(custom_user_stats_deltas).
ALTER TABLE match_player MODIFY COLUMN final_stats Tuple(ability_kills UInt32, ability_points UInt32, absorption_provided UInt32, assists UInt32, boss_damage UInt32, bullet_kills UInt32, creep_damage UInt32, creep_kills UInt32, damage_absorbed UInt32, damage_mitigated UInt32, deaths UInt32, denies UInt32, gold_boss UInt32, gold_boss_orb UInt32, gold_death_loss UInt32, gold_denied UInt32, gold_lane_creep UInt32, gold_lane_creep_orbs UInt32, gold_neutral_creep UInt32, gold_neutral_creep_orbs UInt32, gold_player UInt32, gold_player_orbs UInt32, gold_treasure UInt32, headshot_kills UInt32, heal_lost UInt32, heal_prevented UInt32, hero_bullets_hit UInt32, hero_bullets_hit_crit UInt32, kills UInt32, level UInt32, max_health UInt32, melee_kills UInt32, net_worth UInt32, neutral_damage UInt32, neutral_kills UInt32, player_barriering UInt32, player_damage UInt32, player_damage_taken UInt32, player_healing UInt32, possible_creeps UInt32, self_damage UInt32, self_healing UInt32, shots_hit UInt32, shots_missed UInt32, teammate_barriering UInt32, teammate_healing UInt32, tech_power UInt32, time_stamp_s UInt32, weapon_power UInt32, custom_user_stats Map(LowCardinality(String), UInt32)) MATERIALIZED CAST((stats.ability_kills[-1], stats.ability_points[-1], stats.absorption_provided[-1], stats.assists[-1], stats.boss_damage[-1], stats.bullet_kills[-1], stats.creep_damage[-1], stats.creep_kills[-1], stats.damage_absorbed[-1], stats.damage_mitigated[-1], stats.deaths[-1], stats.denies[-1], stats.gold_boss[-1], stats.gold_boss_orb[-1], stats.gold_death_loss[-1], stats.gold_denied[-1], stats.gold_lane_creep[-1], stats.gold_lane_creep_orbs[-1], stats.gold_neutral_creep[-1], stats.gold_neutral_creep_orbs[-1], stats.gold_player[-1], stats.gold_player_orbs[-1], stats.gold_treasure[-1], stats.headshot_kills[-1], stats.heal_lost[-1], stats.heal_prevented[-1], stats.hero_bullets_hit[-1], stats.hero_bullets_hit_crit[-1], stats.kills[-1], stats.level[-1], stats.max_health[-1], stats.melee_kills[-1], stats.net_worth[-1], stats.neutral_damage[-1], stats.neutral_kills[-1], stats.player_barriering[-1], stats.player_damage[-1], stats.player_damage_taken[-1], stats.player_healing[-1], stats.possible_creeps[-1], stats.self_damage[-1], stats.self_healing[-1], stats.shots_hit[-1], stats.shots_missed[-1], stats.teammate_barriering[-1], stats.teammate_healing[-1], stats.tech_power[-1], stats.time_stamp_s[-1], stats.weapon_power[-1], mapApply((k, v) -> (k, toUInt32(arraySum(v))), custom_user_stats_deltas)), 'Tuple(\n    ability_kills UInt32, ability_points UInt32, absorption_provided UInt32,\n    assists UInt32, boss_damage UInt32, bullet_kills UInt32,\n    creep_damage UInt32, creep_kills UInt32, damage_absorbed UInt32,\n    damage_mitigated UInt32, deaths UInt32, denies UInt32,\n    gold_boss UInt32, gold_boss_orb UInt32, gold_death_loss UInt32,\n    gold_denied UInt32, gold_lane_creep UInt32, gold_lane_creep_orbs UInt32,\n    gold_neutral_creep UInt32, gold_neutral_creep_orbs UInt32, gold_player UInt32,\n    gold_player_orbs UInt32, gold_treasure UInt32, headshot_kills UInt32,\n    heal_lost UInt32, heal_prevented UInt32, hero_bullets_hit UInt32,\n    hero_bullets_hit_crit UInt32, kills UInt32, level UInt32,\n    max_health UInt32, melee_kills UInt32, net_worth UInt32,\n    neutral_damage UInt32, neutral_kills UInt32, player_barriering UInt32,\n    player_damage UInt32, player_damage_taken UInt32, player_healing UInt32,\n    possible_creeps UInt32, self_damage UInt32, self_healing UInt32,\n    shots_hit UInt32, shots_missed UInt32, teammate_barriering UInt32,\n    teammate_healing UInt32, tech_power UInt32, time_stamp_s UInt32,\n    weapon_power UInt32,\n    custom_user_stats Map(LowCardinality(String), UInt32)\n)') CODEC(ZSTD(1));

ALTER TABLE match_player MODIFY COLUMN custom_user_stats_deltas REMOVE DEFAULT;

ALTER TABLE match_player DROP COLUMN `stats.custom_user_stats`;
