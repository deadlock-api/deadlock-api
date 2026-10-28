ALTER TABLE match_player
    DROP PROJECTION IF EXISTS item_stats_by_hero_mode_badge;

ALTER TABLE match_player
    ADD PROJECTION item_stats_by_hero_mode_badge
    (SELECT
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
            ifNull(average_badge, 0),
            start_time,
            match_id,
            account_id
    );

ALTER TABLE match_player
    MATERIALIZE PROJECTION item_stats_by_hero_mode_badge;

ALTER TABLE match_player
    DROP PROJECTION IF EXISTS hero_stats_by_account;

ALTER TABLE match_player
    ADD PROJECTION hero_stats_by_account
    (SELECT
            account_id,
            match_id,
            hero_id,
            won,
            kills,
            deaths,
            assists,
            denies,
            net_worth,
            last_hits,
            max_level,
            max_player_damage,
            max_player_damage_taken,
            max_damage_mitigated,
            max_creep_kills,
            max_boss_damage,
            max_shots_hit,
            max_shots_missed,
            max_hero_bullets_hit,
            max_hero_bullets_hit_crit,
            player_level,
            max_neutral_kills,
            max_creep_damage,
            max_neutral_damage,
            max_max_health,
            team,
            duration_s,
            match_mode,
            game_mode,
            average_badge_team0,
            average_badge_team1,
               average_badge,
            max_possible_creeps,
            start_time
        ORDER BY
            account_id,
            match_id
    );

ALTER TABLE match_player
    MATERIALIZE PROJECTION hero_stats_by_account;

ALTER TABLE match_player
    DROP PROJECTION IF EXISTS ability_order_by_hero;

ALTER TABLE match_player
    ADD PROJECTION ability_order_by_hero
    (SELECT
            hero_id,
            abilities,
            won,
            kills,
            deaths,
            assists,
            account_id,
            start_time,
            average_badge_team0,
            average_badge_team1,
               average_badge,
            duration_s,
            net_worth,
            match_mode,
            game_mode
        ORDER BY hero_id
    );

ALTER TABLE match_player
    MATERIALIZE PROJECTION ability_order_by_hero;

ALTER TABLE match_player
    DROP PROJECTION IF EXISTS hero_stats_by_hero;

ALTER TABLE match_player
    ADD PROJECTION hero_stats_by_hero
    (SELECT
            hero_id,
            account_id,
            match_id,
            won,
            kills,
            deaths,
            assists,
            denies,
            net_worth,
            last_hits,
            max_level,
            max_player_damage,
            max_player_damage_taken,
            max_creep_kills,
            max_boss_damage,
            max_shots_hit,
            max_shots_missed,
            max_hero_bullets_hit,
            max_hero_bullets_hit_crit,
            player_level,
            max_neutral_kills,
            max_creep_damage,
            max_neutral_damage,
            max_max_health,
            duration_s,
            match_mode,
            game_mode,
            start_time,
            max_self_healing,
            max_player_healing,
            max_teammate_healing,
            max_teammate_barriering,
            max_heal_prevented,
            average_badge_team0,
            average_badge_team1,
            average_badge
        ORDER BY
            hero_id,
            account_id,
            match_id
    );

ALTER TABLE match_player
    MATERIALIZE PROJECTION hero_stats_by_hero;
