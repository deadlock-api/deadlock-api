DROP VIEW IF EXISTS match_player_item_v2_mv;
DROP TABLE IF EXISTS match_player_item_v2;

CREATE TABLE match_player_item_v2
(
 `start_time`          DateTime,
 `match_id`            UInt64,
 `account_id`          UInt32,
 `hero_id`             UInt32,
 `item_id`             UInt32,
 `won`                 Bool,
 `average_match_badge` UInt64,
 buy_time_s            UInt32,
 sold_time_s           Nullable(UInt32),
 match_duration_s      UInt32
)
 ENGINE = ReplacingMergeTree()
  PARTITION BY toStartOfMonth(start_time)
  ORDER BY (toStartOfMonth(start_time), hero_id, match_id, account_id, item_id);

CREATE MATERIALIZED VIEW match_player_item_v2_mv
 TO match_player_item_v2
AS
SELECT mi.start_time                                                                 AS start_time,
       mp.match_id                                                                   AS match_id,
       mp.account_id                                                                 AS account_id,
       mp.hero_id                                                                    AS hero_id,
       items.item_id                                                                 AS item_id,
       won ? TRUE : FALSE                                                            as won,
       coalesce(intDivOrZero(mi.average_badge_team0 + mi.average_badge_team1, 2), 0) AS average_match_badge,
       items.game_time_s                                                             AS buy_time_s,
       nullIf(items.sold_time_s, 0)                                                  AS sold_time_s,
       mi.duration_s                                                                 AS match_duration_s
FROM match_player AS mp
      INNER JOIN match_info AS mi USING (match_id)
      ARRAY JOIN items
WHERE won IS NOT NULL AND match_mode IN ('Ranked', 'Unranked');

INSERT INTO match_player_item_v2
SELECT mi.start_time                                                                 AS start_time,
       mp.match_id                                                                   AS match_id,
       mp.account_id                                                                 AS account_id,
       mp.hero_id                                                                    AS hero_id,
       items.item_id                                                                 AS item_id,
       won ? TRUE : FALSE                                                            as won,
       coalesce(intDivOrZero(mi.average_badge_team0 + mi.average_badge_team1, 2), 0) AS average_match_badge,
       items.game_time_s                                                             AS buy_time_s,
       nullIf(items.sold_time_s, 0)                                                  AS sold_time_s,
       mi.duration_s                                                                 AS match_duration_s
FROM match_player AS mp FINAL
      INNER JOIN match_info AS mi FINAL USING (match_id)
      ARRAY JOIN items
WHERE won IS NOT NULL AND match_mode IN ('Ranked', 'Unranked')
 SETTINGS max_partitions_per_insert_block = 100000;
