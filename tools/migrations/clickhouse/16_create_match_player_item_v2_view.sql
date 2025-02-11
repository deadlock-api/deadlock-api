DROP VIEW IF EXISTS match_player_item_v2_mv;
DROP TABLE IF EXISTS match_player_item_v2;

CREATE TABLE default.match_player_item_v2
(
 `start_time`          DateTime,
 `match_id`            UInt64,
 `account_id`          UInt32,
 `hero_id`             UInt32,
 `item_id`             UInt32,
 `won`                 Bool,
 `average_match_badge` UInt64,

 INDEX idx_start_time start_time TYPE minmax,
 INDEX idx_match_id match_id TYPE minmax
)
 ENGINE = ReplacingMergeTree()
  PARTITION BY (hero_id, toStartOfMonth(start_time))
  ORDER BY (match_id, account_id, item_id);

CREATE MATERIALIZED VIEW default.match_player_item_v2_mv
 TO default.match_player_item_v2
AS
SELECT mi.start_time      AS start_time,
       mp.match_id        AS match_id,
       mp.account_id      AS account_id,
       mp.hero_id         AS hero_id,
       items.item_id      AS item_id,
       won ? TRUE : FALSE as won,
       coalesce(
        intDivOrZero(mi.average_badge_team0 + mi.average_badge_team1, 2),
        0
       )                  AS average_match_badge
FROM default.match_player AS mp
      INNER JOIN default.match_info AS mi ON
 mp.match_id = mi.match_id
      ARRAY JOIN items
WHERE won IS NOT NULL
  AND (mi.match_mode = 'Unranked' OR mi.match_mode = 'Ranked');
