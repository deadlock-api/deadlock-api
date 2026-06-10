CREATE DICTIONARY IF NOT EXISTS default.upgrade_items_dict
(
    `id` UInt64
)
PRIMARY KEY id
SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000 USER 'api_readonly_user' PASSWORD '<CLICKHOUSE_RESTRICTED_PASSWORD>' DB 'default' QUERY 'SELECT DISTINCT id FROM items WHERE type = ''upgrade'''))
LIFETIME(MIN 600 MAX 900)
LAYOUT(HASHED());

-- Sanity check before adding columns (expect 173 / 0):
-- SELECT countIf(dictHas('default.upgrade_items_dict', toUInt64(id))) AS upgrades,
--        countIf(dictHas('default.upgrade_items_dict', toUInt64(id)) AND type != 'upgrade') AS misses
-- FROM default.items;

ALTER TABLE default.match_player
    ADD COLUMN IF NOT EXISTS `upgrades.item_id` Array(LowCardinality(UInt32)) MATERIALIZED arrayFilter(
        (x, t) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0,
        items.item_id, items.game_time_s),
    ADD COLUMN IF NOT EXISTS `upgrades.game_time_s` Array(UInt32) MATERIALIZED arrayFilter(
        (t, x) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0,
        items.game_time_s, items.item_id),
    ADD COLUMN IF NOT EXISTS `upgrades.sold_time_s` Array(UInt32) MATERIALIZED arrayFilter(
        (s, x, t) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0,
        items.sold_time_s, items.item_id, items.game_time_s),
    ADD COLUMN IF NOT EXISTS `upgrades.net_worth_at_buy` Array(UInt32) MATERIALIZED arrayFilter(
        (w, x, t) -> dictHas('default.upgrade_items_dict', toUInt64(x)) AND t > 0,
        items.net_worth_at_buy, items.item_id, items.game_time_s);

-- Backfill. Without this, parts written before the ALTER compute the columns
-- on read (correct results, no I/O win). Each statement is an async mutation
-- that writes only the new column files (~16 GiB total for all four); run
-- off-peak and monitor with:
--   SELECT * FROM system.mutations WHERE table = 'match_player' AND NOT is_done;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.item_id`;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.game_time_s`;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.sold_time_s`;
ALTER TABLE default.match_player MATERIALIZE COLUMN `upgrades.net_worth_at_buy`;
