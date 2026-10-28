-- Corrupted items (build 6712, "City Never Sleeps", live 2026-09-29 ~20:50 UTC).
--
-- The Broker swaps a T3/T4 upgrade for a corrupted version (boosted stats plus
-- random penalties). The corrupted purchase keeps the SAME item_id as the normal
-- item and is only distinguishable by bit 23 of `items.upgrade_info`
-- (0x800000 = 8388608; observed value 0x810000). The swapped-out normal item stays
-- in `items` as a regular purchase whose sold_time_s is the swap time.
--
-- Item analytics must not count corrupted purchases as the normal item, so:
--   1. `upgrades.*` (the materialized upgrade-purchase arrays behind the no-hero
--      item_stats path, item_flow_stats, the cohort/enemy rollups and item_stats_agg)
--      drop corrupted purchases.
--   2. Parts written between the patch and step 1 are re-materialized.
--   3. A copy of the hero-led projection that also carries `items.upgrade_info`, so
--      hero-filtered item_stats / item_permutation_stats (which read `items.*` and
--      now filter on upgrade_info) keep using a projection.
--   4. item_stats_agg (refreshable MV, full recompute every hour) reads `upgrades.*`.
--   5. Force the cohort/enemy rollup job (api/src/services/cohort_agg_refresh.rs) to
--      rebuild the days that may already contain corrupted purchases.
--
-- History is NOT rebuilt: nothing before 2026-09-29 can contain a corrupted item,
-- and pre-patch upgrade_info values (0x10001) never have bit 23 set.
-- Never compare upgrade_info for equality (bit 0 changed with the patch, bit 16 is
-- set on normal purchases); only test bit 23.

SET allow_suspicious_low_cardinality_types = 1;

-- 1. Metadata-only change: parts already on disk keep their stored values (correct
--    for all pre-patch data); every part inserted from now on uses the new expression.
ALTER TABLE default.match_player
    MODIFY COLUMN `upgrades.item_id` Array(LowCardinality(UInt32)) MATERIALIZED arrayFilter(
        (x, t, u) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0 AND bitAnd(u, 8388608) = 0,
        items.item_id, items.game_time_s, items.upgrade_info),
    MODIFY COLUMN `upgrades.game_time_s` Array(UInt32) MATERIALIZED arrayFilter(
        (t, x, u) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0 AND bitAnd(u, 8388608) = 0,
        items.game_time_s, items.item_id, items.upgrade_info),
    MODIFY COLUMN `upgrades.sold_time_s` Array(UInt32) MATERIALIZED arrayFilter(
        (s, x, t, u) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0 AND bitAnd(u, 8388608) = 0,
        items.sold_time_s, items.item_id, items.game_time_s, items.upgrade_info),
    MODIFY COLUMN `upgrades.net_worth_at_buy` Array(UInt32) MATERIALIZED arrayFilter(
        (w, x, t, u) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0 AND bitAnd(u, 8388608) = 0,
        `items.net_worth_at_buy`, `items.item_id`, `items.game_time_s`, `items.upgrade_info`);

-- 2. Re-materialize the partitions holding post-patch matches (they were written with
--    the old expression and contain corrupted purchases). Partition = intDiv(match_id, 1e6);
--    post-patch match ids start at ~108.53M. If ids have crossed into a new partition
--    before this runs, repeat for every partition listed by:
--      SELECT DISTINCT _partition_id FROM default.match_player WHERE start_time >= '2026-09-29 20:00:00';
--    Small async mutations (one ~3M-row partition); monitor with
--      SELECT * FROM system.mutations WHERE table = 'match_player' AND NOT is_done;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.item_id` IN PARTITION 108;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.game_time_s` IN PARTITION 108;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.sold_time_s` IN PARTITION 108;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.net_worth_at_buy` IN PARTITION 108;

-- 3. Hero-led projection with `items.upgrade_info`. A normal projection is only
--    eligible when it holds every column a query reads, so once the hero-filtered
--    item queries reference upgrade_info the old projection can no longer serve them
--    and they would full-scan the time window of the base table (~19k granules instead
--    of a few hundred). Identical to item_stats_by_hero_mode_badge plus
--    `items.upgrade_info` (~1.4 GiB compressed table-wide, low entropy).
--
--    New parts get the projection automatically. For existing parts ClickHouse reads
--    parts that lack it from the base table and unions them with the projection reads
--    of parts that have it (verified on 26.9), so materialize the analytics horizon
--    (65 days = partitions 95..108) first, newest first: until a partition is done,
--    hero-filtered item_stats queries touching it are slow for that partition only.
ALTER TABLE default.match_player
    ADD PROJECTION IF NOT EXISTS item_stats_by_hero_mode_badge_v2
    (
        SELECT
            match_id,
            account_id,
            hero_id,
            start_time,
            duration_s,
            match_mode,
            game_mode,
            average_badge_team0,
            average_badge_team1,
            average_badge,
            winning_team,
            match_outcome,
            bot_difficulty,
            game_mode_version,
            is_high_skill_range_parties,
            low_pri_pool,
            new_player_pool,
            not_scored,
            rewards_eligible,
            earned_holiday_award_2025,
            objectives_mask_team0,
            objectives_mask_team1,
            team_score,
            match_tracked_stats,
            team0_tracked_stats,
            team1_tracked_stats,
            mid_boss.destroyed_time_s,
            first_mid_boss_time_s,
            first_objective_destroyed_time_s,
            banned_hero_ids,
            player_slot,
            team,
            won,
            kills,
            deaths,
            assists,
            net_worth,
            last_hits,
            denies,
            ability_points,
            party,
            assigned_lane,
            player_level,
            abandon_match_time_s,
            ability_stats,
            mvp_rank,
            player_tracked_stats,
            hero_build_id,
            demo_processed,
            items.item_id,
            items.game_time_s,
            items.sold_time_s,
            items.upgrade_info,
            abilities,
            stats.time_stamp_s,
            stats.net_worth,
            stats.kills,
            stats.deaths,
            stats.assists,
            max_player_damage,
            max_player_damage_taken,
            max_boss_damage,
            max_creep_damage,
            max_neutral_damage,
            max_max_health,
            max_shots_hit,
            max_shots_missed,
            max_level,
            max_creep_kills,
            max_neutral_kills,
            max_hero_bullets_hit,
            max_hero_bullets_hit_crit,
            max_self_healing,
            max_player_healing,
            max_gold_player,
            max_gold_lane_creep,
            max_gold_neutral_creep,
            max_gold_boss,
            max_gold_treasure,
            max_gold_denied,
            max_gold_death_loss,
            max_damage_mitigated,
            max_absorption_provided,
            max_heal_prevented,
            max_gold_boss_orb,
            max_possible_creeps,
            max_weapon_power,
            max_tech_power,
            max_teammate_healing,
            max_teammate_barriering,
            max_gold_player_orbs,
            max_gold_lane_creep_orbs,
            max_gold_neutral_creep_orbs
        ORDER BY
            hero_id,
            game_mode,
            match_mode,
            ifNull(average_badge, 0)
    );

ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 108;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 107;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 106;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 105;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 104;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 103;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 102;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 101;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 100;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 99;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 98;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 97;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 96;
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 95;

-- Follow-up (off-peak, after the horizon partitions are done): v1 doubles the write
-- and merge cost of this projection while both exist. Queries that do not read
-- upgrade_info (hero_stats, ability_order, ...) can use either projection, so once v2
-- covers every partition v1 is redundant:
--   for p in 0..94: ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION <p>;
--   ALTER TABLE default.match_player DROP PROJECTION item_stats_by_hero_mode_badge;
-- (Dropping v1 before v2 covers all partitions only slows all-time hero queries on the
-- uncovered partitions; the default 30-day windows are unaffected.)

-- 4. item_stats_agg: read the upgrade-only arrays instead of filtering `items.*` at
--    query time. They exclude corrupted purchases (step 1) and are ~40% fewer array
--    bytes than items.item_id/game_time_s/sold_time_s. The view recomputes its whole
--    65-day window every hour, so the first refresh after step 2 finishes is exact.
ALTER TABLE default.item_stats_agg MODIFY QUERY
SELECT
    game_mode,
    match_mode,
    CAST(upgrade_item_id, 'UInt32') AS item_id,
    hero_id,
    team,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    toDate(start_time) AS day,
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqCombinedState(14)(account_id) AS players_state
FROM default.match_player
ARRAY JOIN
    `upgrades.item_id` AS upgrade_item_id,
    `upgrades.game_time_s` AS buy_time,
    `upgrades.sold_time_s` AS sold_time
WHERE (match_mode IN ('Ranked', 'Unranked')) AND (start_time >= (now() - toIntervalDay(65))) AND (duration_s > 0)
GROUP BY
    game_mode,
    match_mode,
    item_id,
    hero_id,
    team,
    least_badge,
    greatest_badge,
    day
SETTINGS max_bytes_before_external_group_by = 20000000000, max_threads = 16, max_execution_time = 1800, log_comment = 'item_stats_agg_refresh';

-- 5. The cohort/enemy rollups read `upgrades.*` too, but are rebuilt per day only when a
--    day's source match count grows by ~2%. Zero the recorded match counts of the
--    post-patch days so the next cycle rebuilds them (run after step 2 has finished).
INSERT INTO default.cohort_agg_refresh_state (table_name, day, source_max_created_at, source_match_count, refreshed_at)
SELECT table_name, day, source_max_created_at, 0, now()
FROM default.cohort_agg_refresh_state FINAL
WHERE day >= '2026-09-29';
