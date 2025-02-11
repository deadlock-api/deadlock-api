DROP TABLE IF EXISTS match_player_encoded_items;
DROP VIEW IF EXISTS match_player_encoded_items_mv;

CREATE TABLE match_player_encoded_items
(
 match_id      UInt64,
 account_id    UInt32,
 hero_id       UInt32,
 average_badge Nullable(UInt32),
 encoded_items Array(BOOL),
 won           Bool
)
 ENGINE = ReplacingMergeTree()
  ORDER BY (match_id, account_id)
  PARTITION BY hero_id;

CREATE MATERIALIZED VIEW match_player_encoded_items_mv TO match_player_encoded_items
AS
WITH all_items AS (SELECT groupUniqArray(item_id) AS items_arr FROM items)
SELECT match_id,
       account_id,
       hero_id,
       won ? True : False                                                 as won,
       if(team = 'Team0', mi.average_badge_team0, mi.average_badge_team1) AS average_badge,
       arrayMap(
        x -> toBool(has(items.item_id, x)),
        items_arr
       )                                                                  AS encoded_items
FROM match_player
      INNER JOIN match_info AS mi USING (match_id)
      INNER JOIN all_items ON 1 = 1
WHERE mi.average_badge_team0 IS NOT null
  AND mi.average_badge_team1 IS NOT null
  AND team IN ('Team0', 'Team1')
  AND game_mode = 'Normal'
  AND match_outcome = 'TeamWin'
  AND match_mode IN ('Ranked', 'Unranked');

INSERT INTO match_player_encoded_items_mv
WITH all_items AS (SELECT groupUniqArray(item_id) AS items_arr FROM items)
SELECT match_id,
       account_id,
       hero_id,
       won ? True : False                                                 as won,
       if(team = 'Team0', mi.average_badge_team0, mi.average_badge_team1) AS average_badge,
       arrayMap(x -> toBool(has(items.item_id, x)), items_arr)            AS encoded_items
FROM match_player
      INNER JOIN match_info AS mi USING (match_id)
      INNER JOIN all_items ON 1 = 1
 PREWHERE match_id >= 31247321
WHERE mi.average_badge_team0 IS NOT null
  AND mi.average_badge_team1 IS NOT null
  AND team IN ('Team0', 'Team1')
  AND game_mode = 'Normal'
  AND match_outcome = 'TeamWin'
  AND match_mode IN ('Ranked', 'Unranked');
