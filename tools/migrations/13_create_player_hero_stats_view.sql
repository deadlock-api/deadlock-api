DROP VIEW IF EXISTS player_hero_stats;
CREATE MATERIALIZED VIEW player_hero_stats
REFRESH EVERY 10 MINUTES
ENGINE = MergeTree() ORDER BY account_id
POPULATE AS
SELECT account_id,
       hero_id,
       COUNT(*)                    as matches,
       max(ranked_badge_level)     as highest_ranked_badge_level,
       SUM(team = mi.winning_team) as wins,
       SUM(kills)                  as kills,
       SUM(deaths)                 as deaths,
       SUM(assists)                as assists,
       60 * avg(net_worth / duration_s) as networth_per_min,
       60 * avg(arraySum(stats.damage_mitigated) / duration_s) as damage_mitigated_per_min,
       60 * avg(arraySum(stats.damage_absorbed) / duration_s) as damage_taken_per_min,
       60 * avg(arraySum(stats.creep_kills) / duration_s) as creeps_per_min,
       avg(arraySum(stats.denies)) as denies_per_match,
       60 * avg(arraySum(stats.neutral_damage) / duration_s) as obj_damage_per_min,
       avg(arraySum(stats.shots_hit) / (arraySum(stats.shots_hit) + arraySum(stats.shots_missed))) as accuracy,
       avg(arraySum(stats.hero_bullets_hit_crit) / (arraySum(stats.hero_bullets_hit_crit) + arraySum(stats.hero_bullets_hit))) as crit_shot_rate
FROM match_player
      INNER JOIN match_info mi USING (match_id)
GROUP by account_id, hero_id
ORDER BY account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
