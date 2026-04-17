ALTER TABLE match_player
    DROP PROJECTION IF EXISTS hero_stats_by_account;

ALTER TABLE match_player
    ADD PROJECTION hero_stats_by_account
        (
        SELECT account_id,
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
               max_max_health
        ORDER BY (account_id, match_id)
        );

ALTER TABLE match_player
    MATERIALIZE PROJECTION hero_stats_by_account;
