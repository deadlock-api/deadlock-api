DROP VIEW IF EXISTS leaderboard_v2;
CREATE MATERIALIZED VIEW leaderboard_v2
 REFRESH EVERY 10 MINUTES ENGINE=MergeTree() ORDER BY(rank)
 POPULATE AS
SELECT pc.account_id as account_id,
       anyLast(region_mode) as region_mode,
       rank() OVER (ORDER BY ranked_badge_level DESC) AS rank,
       anyLast(pc.ranked_badge_level) as ranked_badge_level,
       SUM(phs.wins) AS wins,
       SUM(phs.matches) AS matches_played,
       SUM(phs.kills) AS kills,
       SUM(phs.deaths) AS deaths,
       SUM(phs.assists) AS assists
FROM player_card pc
      INNER JOIN player ON player.account_id = pc.account_id
      LEFT JOIN player_hero_stats phs ON phs.account_id = pc.account_id
GROUP BY pc.account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
