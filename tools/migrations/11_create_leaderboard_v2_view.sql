DROP VIEW IF EXISTS leaderboard_v2;
CREATE MATERIALIZED VIEW leaderboard_v2
 REFRESH EVERY 10 MINUTES ENGINE=MergeTree() ORDER BY(rank)
 POPULATE AS
SELECT pc.account_id                                        as account_id,
       anyLast(region_mode)                                 as region_mode,
       dense_rank() OVER (ORDER BY ranked_badge_level DESC) AS rank,
       anyLast(pc.ranked_badge_level)                       as ranked_badge_level
FROM player_card pc
      INNER JOIN player_region ON player_region.account_id = pc.account_id
GROUP BY pc.account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;

DROP VIEW IF EXISTS leaderboard_account_v2;
CREATE MATERIALIZED VIEW leaderboard_account_v2
 REFRESH EVERY 10 MINUTES ENGINE=MergeTree() ORDER BY(account_id)
 POPULATE AS
SELECT pc.account_id                                        as account_id,
       anyLast(region_mode)                                 as region_mode,
       dense_rank() OVER (ORDER BY ranked_badge_level DESC) AS rank,
       anyLast(pc.ranked_badge_level)                       as ranked_badge_level
FROM player_card pc
      INNER JOIN player_region ON player_region.account_id = pc.account_id
GROUP BY pc.account_id
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
