DROP VIEW IF EXISTS match_player_encoded_items;

CREATE MATERIALIZED VIEW match_player_encoded_items
 REFRESH EVERY 30 MINUTES
 ENGINE = MergeTree()
 ORDER BY (hero_id)
 PARTITION BY hero_id
 POPULATE
AS
WITH all_items AS (SELECT groupUniqArray(item_id) as items_arr FROM items)
SELECT match_id,
       account_id,
       hero_id,
       team == 'Team0' ? mi.average_badge_team0 : mi.average_badge_team1 as average_badge,
       arrayMap(x -> toBool(has(items.item_id, x)), items_arr)        as encoded_items,
       won
FROM match_player FINAL
      INNER JOIN match_info mi FINAL USING (match_id)
      INNER JOIN all_items ON 1 = 1
WHERE mi.average_badge_team0 is not null
  and mi.average_badge_team1 is not null
  and team IN ('Team0', 'Team1')
  and game_mode = 'Normal'
  and match_id >= 28626954
  and match_outcome = 'TeamWin'
  and match_mode IN ('Ranked', 'Unranked')
ORDER BY hero_id, average_badge
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
