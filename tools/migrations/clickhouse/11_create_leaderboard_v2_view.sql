DROP VIEW IF EXISTS leaderboard_v2;
CREATE MATERIALIZED VIEW leaderboard_v2
 REFRESH EVERY 10 MINUTES ENGINE=MergeTree() ORDER BY(rank)
 POPULATE AS
WITH last_player_cards AS (SELECT account_id, ranked_badge_level
                           FROM player_card
                           WHERE ranked_badge_level > 0
                           ORDER BY created_at DESC
                           LIMIT 1 BY account_id)
SELECT pmh.account_id                                 as account_id,
       anyLast(region_mode)                           as region_mode,
       rank() OVER (ORDER BY ranked_badge_level DESC) AS rank,
       any(pc.ranked_badge_level)                     as ranked_badge_level,
       SUM(pmh.match_result)                          AS wins,
       COUNT(pmh.account_id)                          AS matches_played,
       SUM(pmh.player_kills)                          AS kills,
       SUM(pmh.player_deaths)                         AS deaths,
       SUM(pmh.player_assists)                        AS assists
FROM player_match_history pmh
      INNER JOIN player ON player.account_id = pmh.account_id
      INNER JOIN last_player_cards pc ON pmh.account_id = pc.account_id
GROUP BY pmh.account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
