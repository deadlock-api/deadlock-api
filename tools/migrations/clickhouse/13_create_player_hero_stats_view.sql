DROP VIEW IF EXISTS player_hero_stats;
CREATE MATERIALIZED VIEW player_hero_stats
REFRESH EVERY 60 MINUTES
ENGINE = MergeTree() ORDER BY account_id
POPULATE AS
SELECT account_id,
       hero_id,
       COUNT()                                                                                                as matches_played,
       SUM(team = mi.winning_team)                                                                            as wins,
       SUM(kills)                                                                                             as kills,
       SUM(deaths)                                                                                            as deaths,
       SUM(assists)                                                                                           as assists,
       avg(arrayMax(stats.level))                                                                             as ending_level,
       avg(denies)                                                                                            as denies_per_match,
       60 * avg(net_worth / duration_s)                                                                       as networth_per_min,
       60 * avg(last_hits / duration_s)                                                                       as last_hits_per_min,
       60 * avg(denies / duration_s)                                                                          as denies_per_min,
       60 * avg(arrayMax(stats.player_damage) / duration_s)                                                   as damage_mitigated_per_min,
       60 * avg(arrayMax(stats.player_damage_taken) / duration_s)                                             as damage_taken_per_min,
       60 * avg(arrayMax(stats.creep_kills) / duration_s)                                                     as creeps_per_min,
       60 * avg(arrayMax(stats.neutral_damage) / duration_s)                                                  as obj_damage_per_min,
       avg(arrayMax(stats.shots_hit) / greatest(1, arrayMax(stats.shots_hit) +
                                                   arrayMax(stats.shots_missed)))                             as accuracy,
       avg(arrayMax(stats.hero_bullets_hit_crit) /
           greatest(1, arrayMax(stats.hero_bullets_hit_crit) +
                       arrayMax(stats.hero_bullets_hit)))                                                     as crit_shot_rate,
       groupUniqArray(mi.match_id)                                                                            as matches
FROM match_player
      INNER ANY JOIN match_info mi USING (match_id)
WHERE match_outcome = 'TeamWin' AND match_mode IN ('Ranked', 'Unranked') AND game_mode = 'Normal'
GROUP by account_id, hero_id
ORDER BY account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
