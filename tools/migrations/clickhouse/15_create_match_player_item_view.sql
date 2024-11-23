DROP VIEW IF EXISTS match_player_item;

CREATE MATERIALIZED VIEW match_player_item
 REFRESH EVERY 30 MINUTES
 ENGINE = MergeTree()
ORDER BY (match_id, account_id, item_id)
 PARTITION BY hero_id
 POPULATE
AS
SELECT
    match_id,
    account_id,
    hero_id,
    items.item_id as item_id,
    won,
    ranked_badge_level
FROM match_player
ARRAY JOIN items
 SETTINGS allow_experimental_refreshable_materialized_view = 1;
