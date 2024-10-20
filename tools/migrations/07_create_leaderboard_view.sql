DROP VIEW IF EXISTS leaderboard;
CREATE MATERIALIZED VIEW leaderboard
REFRESH EVERY 10 MINUTES ENGINE=MergeTree() ORDER BY(rank)
POPULATE AS
SELECT account_id,
       ROUND(anyLast(player_score)) AS player_score,
       anyLast(region_mode)  as region_mode,
       COUNT()               AS matches_played,
       row_number() OVER (ORDER BY player_score DESC) AS rank
FROM mmr_history
      INNER JOIN player_region ON player_region.account_id = account_id
GROUP BY account_id
SETTINGS allow_experimental_refreshable_materialized_view = 1;
