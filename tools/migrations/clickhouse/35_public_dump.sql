-- Public data-lake export layer.
--
-- Every published table is read through a view in the `dump` database with an explicit
-- column list, so base-table changes only reach the public lake when the view is edited.
-- Views are SQL SECURITY INVOKER so the GDPR row policies (maintained by the API in
-- routes/v1/data_privacy) filter protected accounts for the dump user as well.
--
-- Materialized columns are intentionally not published (parity with the previous dump), and
-- stats.custom_user_stats is left out: it is ~40% of every match_player file and barely compresses.
--
-- The named collection holding the R2 credentials is created by hand, not here:
--   CREATE NAMED COLLECTION r2_dump AS
--       url = 'https://<account_id>.r2.cloudflarestorage.com/<bucket>/',
--       access_key_id = '...', secret_access_key = '...', format = 'Parquet';
--   GRANT NAMED COLLECTION ON r2_dump TO dump_user;
-- (the admin user needs <named_collection_control>1</named_collection_control> in users.d)
--
-- The dump user is created by hand as well (password lives in the API env):
--   CREATE USER dump_user IDENTIFIED BY '...' SETTINGS
--       max_threads = 4, max_insert_threads = 4, max_execution_time = 7200,
--       max_memory_usage = 17179869184, priority = 10;

-- match_player carries LowCardinality(UInt32) columns; the view inherits their types.
SET allow_suspicious_low_cardinality_types = 1;

CREATE DATABASE IF NOT EXISTS dump;

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
    `objectives_mask_team0`,
    `objectives_mask_team1`,
    `is_high_skill_range_parties`,
    `low_pri_pool`,
    `new_player_pool`,
    `not_scored`,
    `game_mode_version`,
    `objectives.destroyed_time_s`,
    `objectives.creep_damage`,
    `objectives.creep_damage_mitigated`,
    `objectives.player_damage`,
    `objectives.player_damage_mitigated`,
    `objectives.first_damage_time_s`,
    `objectives.team_objective`,
    `objectives.team`,
    `objectives.player_spirit_damage`,
    `mid_boss.team_killed`,
    `mid_boss.team_claimed`,
    `mid_boss.destroyed_time_s`,
    `street_brawl_rounds.round_duration_s`,
    `street_brawl_rounds.winning_team`,
    `team_score`,
    `match_tracked_stats`,
    `team0_tracked_stats`,
    `team1_tracked_stats`,
    `account_id`,
    `player_slot`,
    `team`,
    `kills`,
    `deaths`,
    `assists`,
    `net_worth`,
    `hero_id`,
    `last_hits`,
    `denies`,
    `ability_points`,
    `party`,
    `assigned_lane`,
    `player_level`,
    `abandon_match_time_s`,
    `ability_stats`,
    `stats_type_stat`,
    `book_reward.book_id`,
    `book_reward.xp_amount`,
    `book_reward.starting_xp`,
    `death_details.game_time_s`,
    `death_details.killer_player_slot`,
    `death_details.death_pos`,
    `death_details.killer_pos`,
    `death_details.death_duration_s`,
    `items.game_time_s`,
    `items.item_id`,
    `items.upgrade_id`,
    `items.sold_time_s`,
    `items.flags`,
    `items.imbued_ability_id`,
    `items.upgrade_info`,
    `stats.time_stamp_s`,
    `stats.net_worth`,
    `stats.gold_player`,
    `stats.gold_player_orbs`,
    `stats.gold_lane_creep_orbs`,
    `stats.gold_neutral_creep_orbs`,
    `stats.gold_boss`,
    `stats.gold_boss_orb`,
    `stats.gold_treasure`,
    `stats.gold_denied`,
    `stats.gold_death_loss`,
    `stats.gold_lane_creep`,
    `stats.gold_neutral_creep`,
    `stats.kills`,
    `stats.deaths`,
    `stats.assists`,
    `stats.creep_kills`,
    `stats.neutral_kills`,
    `stats.possible_creeps`,
    `stats.creep_damage`,
    `stats.player_damage`,
    `stats.neutral_damage`,
    `stats.boss_damage`,
    `stats.denies`,
    `stats.player_healing`,
    `stats.ability_points`,
    `stats.self_healing`,
    `stats.player_barriering`,
    `stats.teammate_healing`,
    `stats.teammate_barriering`,
    `stats.self_damage`,
    `stats.bullet_kills`,
    `stats.melee_kills`,
    `stats.ability_kills`,
    `stats.headshot_kills`,
    `stats.player_damage_taken`,
    `stats.max_health`,
    `stats.weapon_power`,
    `stats.tech_power`,
    `stats.shots_hit`,
    `stats.shots_missed`,
    `stats.damage_absorbed`,
    `stats.absorption_provided`,
    `stats.hero_bullets_hit`,
    `stats.hero_bullets_hit_crit`,
    `stats.heal_prevented`,
    `stats.heal_lost`,
    `stats.damage_mitigated`,
    `stats.level`,
    `rewards_eligible`,
    `earned_holiday_award_2025`,
    `power_up_buffs.type`,
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
    `average_badge`
FROM default.match_player;

CREATE OR REPLACE VIEW dump.match_salts SQL SECURITY INVOKER AS
SELECT
    `match_id`,
    `cluster_id`,
    `metadata_salt`,
    `replay_salt`,
    `created_at`
FROM default.match_salts;

CREATE OR REPLACE VIEW dump.leaderboard SQL SECURITY INVOKER AS
SELECT
    `fetched_at`,
    `region`,
    `account_name`,
    `rank`,
    `leaderboard_position`,
    `top_hero_ids`
FROM default.leaderboard;

CREATE OR REPLACE VIEW dump.hero_leaderboard SQL SECURITY INVOKER AS
SELECT
    `fetched_at`,
    `region`,
    `hero_id`,
    `account_name`,
    `rank`,
    `leaderboard_position`,
    `top_hero_ids`
FROM default.hero_leaderboard;

CREATE OR REPLACE VIEW dump.steam_profiles SQL SECURITY INVOKER AS
SELECT
    `account_id`,
    `personaname`,
    `profileurl`,
    `avatar`,
    `personastate`,
    `realname`,
    `countrycode`,
    `last_updated`,
    `avatarmedium`,
    `avatarfull`,
    `friends.account_id`,
    `friends.friend_since`
FROM default.steam_profiles;

GRANT SELECT ON dump.* TO dump_user;
GRANT SELECT ON default.match_player TO dump_user;
GRANT SELECT ON default.match_salts TO dump_user;
GRANT SELECT ON default.leaderboard TO dump_user;
GRANT SELECT ON default.hero_leaderboard TO dump_user;
GRANT SELECT ON default.steam_profiles TO dump_user;
GRANT S3 ON *.* TO dump_user;
-- Table functions materialize through a temporary table.
GRANT CREATE TEMPORARY TABLE ON *.* TO dump_user;
GRANT KILL QUERY ON *.* TO dump_user;
-- KILL QUERY WHERE ... reads system.processes.
GRANT SELECT ON system.processes TO dump_user;
