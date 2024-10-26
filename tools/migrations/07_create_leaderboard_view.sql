DROP VIEW IF EXISTS leaderboard;
CREATE MATERIALIZED VIEW leaderboard
 REFRESH EVERY 10 MINUTES ENGINE=MergeTree() ORDER BY(rank)
 POPULATE AS
SELECT mh.account_id as account_id,
       anyLast(region_mode)  as region_mode,
       row_number() OVER (ORDER BY ranked_badge_level DESC, player_score DESC) AS rank,
       anyLast(pc.ranked_badge_level) as ranked_badge_level,
       COUNT()               AS matches_played,
       ROUND(anyLast(player_score)) AS player_score
FROM mmr_history mh
      INNER JOIN player_region ON player_region.account_id = mh.account_id
      LEFT JOIN player_card pc ON pc.account_id = mh.account_id
GROUP BY mh.account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;

DROP VIEW IF EXISTS leaderboard_account;
CREATE MATERIALIZED VIEW leaderboard_account
 REFRESH EVERY 10 MINUTES ENGINE=MergeTree() ORDER BY(account_id)
 POPULATE AS
SELECT mh.account_id as account_id,
       anyLast(region_mode)  as region_mode,
       row_number() OVER (ORDER BY ranked_badge_level DESC, player_score DESC) AS rank,
       anyLast(pc.ranked_badge_level) as ranked_badge_level,
       COUNT()               AS matches_played,
       ROUND(anyLast(player_score)) AS player_score
FROM mmr_history mh
      INNER JOIN player_region ON player_region.account_id = mh.account_id
      LEFT JOIN player_card pc ON pc.account_id = mh.account_id
GROUP BY mh.account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
