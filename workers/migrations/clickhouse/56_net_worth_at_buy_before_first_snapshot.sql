-- Net worth at buy for purchases before the first stats snapshot (#575).
--
-- `stats.*` snapshots come every 180 s, the first at 180 s. A purchase at or before it finds
-- index 1, asks for element 0, gets NULL and used to fall back to the player's FINAL net worth,
-- which put ~14% of all purchases (starting items, median 83 s) into the late-game net worth
-- buckets of item_stats, item_flow_stats' adjusted win rate and GraphQL. They now take the
-- first snapshot (median 1,755 souls). Purchases after it are unchanged. The inline copies in
-- item_stats.rs (NET_WORTH_AT_BUY_INLINE_EXPR) and item_flow_stats.rs must stay identical.

-- 1. Metadata-only: parts inserted from now on use the new expression.
ALTER TABLE default.match_player
    MODIFY COLUMN `items.net_worth_at_buy` Array(UInt32) MATERIALIZED arrayMap(
        bt -> coalesce(
            arrayElementOrNull(stats.net_worth, arrayFirstIndex(ts -> ts >= bt, stats.time_stamp_s) - 1),
            arrayElementOrNull(stats.net_worth, 1),
            net_worth),
        items.game_time_s);

-- 2. Rewrite the stored values (writes only the column, ~9 GiB; no projection holds it).
--    Wait for it to finish before step 3, which reads the column:
--      SELECT * FROM system.mutations WHERE table = 'match_player' AND NOT is_done;
ALTER TABLE default.match_player MATERIALIZE COLUMN `items.net_worth_at_buy`;

-- 3. `upgrades.net_worth_at_buy` filters `items.net_worth_at_buy`. Re-materialize all four
--    `upgrades.*` columns together, not just that one: they filter with `upgrade_items_dict`,
--    which was incomplete when some parts were written (52k rows, 0.014%, missing common
--    upgrades such as Extra Spirit), so recomputing one of them alone against today's dict
--    would misalign it with the stored `upgrades.item_id`. Together they are ~28 GiB and also
--    restore those rows' missing purchases.
--    Check beforehand that the dict is LOADED with every upgrade (173 on 2026-10-21):
--      SELECT status, element_count FROM system.dictionaries WHERE name = 'upgrade_items_dict';
ALTER TABLE default.match_player
    MATERIALIZE COLUMN `upgrades.item_id`,
    MATERIALIZE COLUMN `upgrades.game_time_s`,
    MATERIALIZE COLUMN `upgrades.sold_time_s`,
    MATERIALIZE COLUMN `upgrades.net_worth_at_buy`;

-- 4. Rebuild the net worth cohort rollup (it buckets `upgrades.net_worth_at_buy`) on its next
--    cycle (api/src/services/cohort_agg_refresh.rs) by zeroing its recorded match counts.
--    Run after step 3 has finished.
INSERT INTO default.cohort_agg_refresh_state (table_name, day, source_max_created_at, source_match_count, refreshed_at)
SELECT table_name, day, source_max_created_at, 0, now()
FROM default.cohort_agg_refresh_state FINAL
WHERE table_name = 'default.item_cohort_stats_net_worth_agg_v2';
