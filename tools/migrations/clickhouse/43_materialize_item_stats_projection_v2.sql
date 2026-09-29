-- Follow-up to 42_exclude_corrupted_items.sql: finish the `item_stats_by_hero_mode_badge_v2`
-- projection (hero-led projection + `items.upgrade_info`) and retire the old
-- `item_stats_by_hero_mode_badge`.
--
-- State on 2026-09-30 (system.parts / system.projection_parts):
--   * v2 covers every part of partitions 95..108 (migration 42) plus parts inserted since
--     (a few late old-match inserts in 45..94). Almost every part of partitions 0..94 still
--     lacks it: 306.4M rows, 706 GB of base data on disk.
--   * v1 covers all 109 partitions, 74.2 GiB, of which 69.8 GB is in partitions 0..94.
--
-- Until v2 covers a partition, a hero-filtered item_stats / item_permutation_stats query that
-- reaches into it (all-time or >65-day windows) reads that partition's parts from the base
-- table, because the projection is only used for parts that have it. Queries that do not read
-- upgrade_info (hero_stats, ability_order, ...) can use v1 or v2.
--
-- Trade-off to know before running (measured 2026-09-30): the hero-led projections have no
-- start_time index, and match_player has no part-level start_time pruning (it is partitioned
-- by match_id), so a projection read returns every hero row of every part that has the
-- projection, whatever the time window. The v1 hero-7 query read 14.3M rows for both a 1-day
-- and a 7-day window. Today v2 only exists on 95..108, so a hero-filtered item_stats query
-- reads ~1.8M rows (hero 7) through v2, and the older partitions are pruned by idx_start_time
-- on the base table. Once v2 covers 0..94, that becomes ~14.3M rows, which is what the
-- v1-served hero queries (hero_stats, ability_order, ...) already read today. That is about
-- break-even with the base table for the default 30-day window (16.9M rows), and worse for
-- short windows. Only a `match_id >=` bound prunes projection parts (1-day window + match_id
-- floor: 75k rows), so the real fix is for the routes to derive a match_id floor from
-- min_unix_timestamp. The API already does this for corrupted_items=only.
--
-- Cost estimate, measured on production (system.part_log, event_type = 'MutatePart'):
--   * v2 on partitions 95..99 (~3.3M rows each, dominated by one big part): 123-145 s per
--     partition, read 1.03-1.05 GiB per 1M rows, peak memory ~650 MiB per part, with 14
--     partitions running in parallel.
--   * v1 (the same projection minus upgrade_info) on the whole table on 2026-09-29 14:46:
--     9.5 min wall for all 109 partitions with the full mutation pool (background_pool_size
--     = 32), 5.7 h summed per-part time, 0.91 GB read per 1M rows. The "v1 took" figure on
--     each statement below is the largest part's duration in that run. It ran under full
--     contention, so treat it as an upper bound: the v2 runs on 95..99 were ~2x faster per row.
--   * Totals for 0..94: read ~322 GiB (the base columns the projection selects, read
--     sequentially); write ~69 GiB (new projection parts; base columns are hard-linked, not
--     rewritten). Expect ~1 GB/s of reads while the pool is saturated. Free disk when this
--     was written: 1.59 TiB.
--   * Partitions 25..45 hold single 5-8M-row parts (~5-10 min each). Partitions 0..17 are tiny.
--
-- Every statement is an async mutation: it returns immediately, and mutations run concurrently
-- up to the mutation pool limit. Partitions are listed newest first so the most-queried data is
-- covered first. To throttle, run them in batches of ~10 and wait for each batch to finish
-- (use the query in step 2a). Run off-peak, because they compete with inserts, merges and
-- analytics queries for disk bandwidth.
--
-- Monitor:
--   SELECT mutation_id, command, parts_to_do, latest_fail_reason FROM system.mutations
--   WHERE database = 'default' AND table = 'match_player' AND NOT is_done;

-- 1. Materialize v2 on partitions 94..0 (partition list taken from system.parts on 2026-09-30).
-- p94: 3.34M rows in 8 parts (largest 3.33M); read ~3.5 GiB, write ~0.76 GiB; v1 took 289s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 94;
-- p93: 3.29M rows in 9 parts (largest 3.28M); read ~3.5 GiB, write ~0.75 GiB; v1 took 291s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 93;
-- p92: 3.17M rows in 11 parts (largest 3.16M); read ~3.3 GiB, write ~0.72 GiB; v1 took 299s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 92;
-- p91: 3.23M rows in 11 parts (largest 3.23M); read ~3.4 GiB, write ~0.73 GiB; v1 took 310s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 91;
-- p90: 3.12M rows in 7 parts (largest 3.11M); read ~3.3 GiB, write ~0.70 GiB; v1 took 320s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 90;
-- p89: 3.42M rows in 10 parts (largest 3.41M); read ~3.6 GiB, write ~0.78 GiB; v1 took 332s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 89;
-- p88: 3.36M rows in 8 parts (largest 3.35M); read ~3.5 GiB, write ~0.76 GiB; v1 took 332s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 88;
-- p87: 3.23M rows in 8 parts (largest 3.22M); read ~3.4 GiB, write ~0.73 GiB; v1 took 326s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 87;
-- p86: 3.28M rows in 9 parts (largest 3.27M); read ~3.4 GiB, write ~0.74 GiB; v1 took 319s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 86;
-- p85: 3.26M rows in 4 parts (largest 3.26M); read ~3.4 GiB, write ~0.74 GiB; v1 took 323s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 85;
-- p84: 3.25M rows in 6 parts (largest 3.24M); read ~3.4 GiB, write ~0.73 GiB; v1 took 318s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 84;
-- p83: 3.29M rows in 5 parts (largest 3.29M); read ~3.5 GiB, write ~0.74 GiB; v1 took 334s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 83;
-- p82: 3.27M rows in 5 parts (largest 3.26M); read ~3.4 GiB, write ~0.73 GiB; v1 took 314s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 82;
-- p81: 3.28M rows in 6 parts (largest 3.28M); read ~3.4 GiB, write ~0.74 GiB; v1 took 332s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 81;
-- p80: 3.35M rows in 6 parts (largest 3.34M); read ~3.5 GiB, write ~0.75 GiB; v1 took 300s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 80;
-- p79: 3.25M rows in 4 parts (largest 3.24M); read ~3.4 GiB, write ~0.72 GiB; v1 took 288s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 79;
-- p78: 3.24M rows in 4 parts (largest 3.23M); read ~3.4 GiB, write ~0.71 GiB; v1 took 280s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 78;
-- p77: 3.20M rows in 7 parts (largest 3.20M); read ~3.4 GiB, write ~0.71 GiB; v1 took 256s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 77;
-- p76: 3.07M rows in 8 parts (largest 3.07M); read ~3.2 GiB, write ~0.68 GiB; v1 took 245s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 76;
-- p75: 2.92M rows in 6 parts (largest 2.91M); read ~3.1 GiB, write ~0.65 GiB; v1 took 212s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 75;
-- p74: 3.00M rows in 12 parts (largest 2.99M); read ~3.1 GiB, write ~0.67 GiB; v1 took 216s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 74;
-- p73: 3.56M rows in 8 parts (largest 3.55M); read ~3.7 GiB, write ~0.79 GiB; v1 took 302s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 73;
-- p72: 3.90M rows in 5 parts (largest 3.90M); read ~4.1 GiB, write ~0.84 GiB; v1 took 319s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 72;
-- p71: 3.59M rows in 9 parts (largest 3.54M); read ~3.8 GiB, write ~0.79 GiB; v1 took 278s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 71;
-- p70: 3.49M rows in 10 parts (largest 3.44M); read ~3.7 GiB, write ~0.78 GiB; v1 took 274s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 70;
-- p69: 3.23M rows in 7 parts (largest 3.19M); read ~3.4 GiB, write ~0.72 GiB; v1 took 220s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 69;
-- p68: 3.25M rows in 7 parts (largest 3.20M); read ~3.4 GiB, write ~0.72 GiB; v1 took 210s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 68;
-- p67: 2.79M rows in 6 parts (largest 2.79M); read ~2.9 GiB, write ~0.62 GiB; v1 took 149s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 67;
-- p66: 2.93M rows in 6 parts (largest 2.92M); read ~3.1 GiB, write ~0.65 GiB; v1 took 181s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 66;
-- p65: 2.84M rows in 7 parts (largest 2.84M); read ~3.0 GiB, write ~0.63 GiB; v1 took 170s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 65;
-- p64: 2.75M rows in 5 parts (largest 2.75M); read ~2.9 GiB, write ~0.61 GiB; v1 took 140s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 64;
-- p63: 2.55M rows in 8 parts (largest 2.54M); read ~2.7 GiB, write ~0.57 GiB; v1 took 115s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 63;
-- p62: 2.65M rows in 9 parts (largest 2.64M); read ~2.8 GiB, write ~0.59 GiB; v1 took 114s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 62;
-- p61: 2.48M rows in 11 parts (largest 2.48M); read ~2.6 GiB, write ~0.55 GiB; v1 took 116s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 61;
-- p60: 2.69M rows in 6 parts (largest 2.69M); read ~2.8 GiB, write ~0.60 GiB; v1 took 115s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 60;
-- p59: 2.71M rows in 7 parts (largest 2.70M); read ~2.8 GiB, write ~0.60 GiB; v1 took 106s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 59;
-- p58: 2.52M rows in 5 parts (largest 2.52M); read ~2.6 GiB, write ~0.55 GiB; v1 took 101s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 58;
-- p57: 2.42M rows in 5 parts (largest 2.42M); read ~2.5 GiB, write ~0.53 GiB; v1 took 94s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 57;
-- p56: 2.22M rows in 7 parts (largest 2.22M); read ~2.3 GiB, write ~0.48 GiB; v1 took 77s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 56;
-- p55: 2.04M rows in 8 parts (largest 2.03M); read ~2.1 GiB, write ~0.43 GiB; v1 took 76s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 55;
-- p54: 1.85M rows in 8 parts (largest 1.84M); read ~1.9 GiB, write ~0.38 GiB; v1 took 73s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 54;
-- p53: 1.82M rows in 8 parts (largest 1.82M); read ~1.9 GiB, write ~0.37 GiB; v1 took 69s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 53;
-- p52: 1.67M rows in 6 parts (largest 1.67M); read ~1.8 GiB, write ~0.33 GiB; v1 took 60s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 52;
-- p51: 2.59M rows in 5 parts (largest 2.59M); read ~2.7 GiB, write ~0.53 GiB; v1 took 92s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 51;
-- p50: 4.41M rows in 5 parts (largest 4.40M); read ~4.6 GiB, write ~0.97 GiB; v1 took 257s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 50;
-- p49: 3.85M rows in 5 parts (largest 3.85M); read ~4.0 GiB, write ~0.84 GiB; v1 took 191s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 49;
-- p48: 3.55M rows in 6 parts (largest 3.55M); read ~3.7 GiB, write ~0.77 GiB; v1 took 185s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 48;
-- p47: 3.48M rows in 7 parts (largest 3.47M); read ~3.7 GiB, write ~0.74 GiB; v1 took 196s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 47;
-- p46: 3.78M rows in 6 parts (largest 3.77M); read ~4.0 GiB, write ~0.79 GiB; v1 took 200s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 46;
-- p45: 5.60M rows in 6 parts (largest 5.60M); read ~5.9 GiB, write ~1.17 GiB; v1 took 302s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 45;
-- p44: 5.73M rows in 5 parts (largest 5.72M); read ~6.0 GiB, write ~1.20 GiB; v1 took 313s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 44;
-- p43: 5.23M rows in 4 parts (largest 5.23M); read ~5.5 GiB, write ~1.10 GiB; v1 took 280s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 43;
-- p42: 5.27M rows in 6 parts (largest 5.27M); read ~5.5 GiB, write ~1.11 GiB; v1 took 273s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 42;
-- p41: 4.69M rows in 3 parts (largest 4.69M); read ~4.9 GiB, write ~0.99 GiB; v1 took 249s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 41;
-- p40: 6.87M rows in 3 parts (largest 6.87M); read ~7.2 GiB, write ~1.43 GiB; v1 took 478s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 40;
-- p39: 5.95M rows in 3 parts (largest 5.95M); read ~6.2 GiB, write ~1.25 GiB; v1 took 355s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 39;
-- p38: 7.88M rows in 2 parts (largest 7.88M); read ~8.3 GiB, write ~1.65 GiB; v1 took 556s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 38;
-- p37: 8.17M rows in 3 parts (largest 8.17M); read ~8.6 GiB, write ~1.73 GiB; v1 took 565s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 37;
-- p36: 8.03M rows in 3 parts (largest 8.03M); read ~8.4 GiB, write ~1.71 GiB; v1 took 552s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 36;
-- p35: 7.64M rows in 3 parts (largest 7.64M); read ~8.0 GiB, write ~1.72 GiB; v1 took 546s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 35;
-- p34: 8.25M rows in 2 parts (largest 8.25M); read ~8.7 GiB, write ~1.85 GiB; v1 took 563s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 34;
-- p33: 7.84M rows in 4 parts (largest 7.84M); read ~8.2 GiB, write ~1.78 GiB; v1 took 543s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 33;
-- p32: 7.89M rows in 1 parts (largest 7.89M); read ~8.3 GiB, write ~1.74 GiB; v1 took 531s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 32;
-- p31: 8.01M rows in 3 parts (largest 8.01M); read ~8.4 GiB, write ~1.75 GiB; v1 took 528s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 31;
-- p30: 7.46M rows in 3 parts (largest 7.46M); read ~7.8 GiB, write ~1.63 GiB; v1 took 485s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 30;
-- p29: 7.97M rows in 1 parts (largest 7.97M); read ~8.4 GiB, write ~1.74 GiB; v1 took 528s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 29;
-- p28: 5.69M rows in 2 parts (largest 5.69M); read ~6.0 GiB, write ~1.21 GiB; v1 took 311s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 28;
-- p27: 5.44M rows in 2 parts (largest 5.44M); read ~5.7 GiB, write ~1.98 GiB; v1 took 192s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 27;
-- p26: 7.93M rows in 1 parts (largest 7.93M); read ~8.3 GiB, write ~2.92 GiB; v1 took 307s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 26;
-- p25: 6.81M rows in 2 parts (largest 6.81M); read ~7.2 GiB, write ~1.46 GiB; v1 took 413s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 25;
-- p24: 1.27M rows in 1 parts (largest 1.27M); read ~1.3 GiB, write ~0.28 GiB; v1 took 56s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 24;
-- p23: 3.54M rows in 1 parts (largest 3.54M); read ~3.7 GiB, write ~0.78 GiB; v1 took 178s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 23;
-- p22: 2.48M rows in 1 parts (largest 2.48M); read ~2.6 GiB, write ~0.55 GiB; v1 took 92s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 22;
-- p21: 1.87M rows in 1 parts (largest 1.87M); read ~2.0 GiB, write ~0.41 GiB; v1 took 67s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 21;
-- p20: 1.48M rows in 2 parts (largest 1.48M); read ~1.6 GiB, write ~0.33 GiB; v1 took 57s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 20;
-- p19: 0.98M rows in 3 parts (largest 0.98M); read ~1.0 GiB, write ~0.22 GiB; v1 took 41s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 19;
-- p18: 0.66M rows in 1 parts (largest 0.66M); read ~0.7 GiB, write ~0.15 GiB; v1 took 24s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 18;
-- p17: 0.02M rows in 2 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 17;
-- p16: 0.02M rows in 2 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 16;
-- p15: 0.02M rows in 1 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 15;
-- p14: 0.02M rows in 3 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 14;
-- p13: 0.02M rows in 3 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 13;
-- p12: 0.02M rows in 3 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 12;
-- p11: 0.02M rows in 1 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 11;
-- p10: 0.02M rows in 4 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took <1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 10;
-- p9: 0.02M rows in 2 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 3s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 9;
-- p8: 0.02M rows in 2 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 8;
-- p7: 0.02M rows in 1 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 4s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 7;
-- p6: 0.02M rows in 2 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 2s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 6;
-- p5: 0.01M rows in 1 parts (largest 0.01M); read ~0.0 GiB, write ~0.00 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 5;
-- p4: 0.01M rows in 1 parts (largest 0.01M); read ~0.0 GiB, write ~0.00 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 4;
-- p3: 0.02M rows in 1 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 3;
-- p2: 0.02M rows in 1 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took 1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 2;
-- p1: 0.01M rows in 1 parts (largest 0.01M); read ~0.0 GiB, write ~0.00 GiB; v1 took <1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 1;
-- p0: 0.02M rows in 2 parts (largest 0.02M); read ~0.0 GiB, write ~0.01 GiB; v1 took <1s for its largest part
ALTER TABLE default.match_player MATERIALIZE PROJECTION item_stats_by_hero_mode_badge_v2 IN PARTITION 0;

-- 2. ========================= SEPARATE STEP, RUN LATER =========================
--    Run this only after EVERY step-1 mutation has finished. Both checks must return 0 rows:
--
--    -- a) no unfinished v2 mutation
--    SELECT mutation_id, command, parts_to_do, latest_fail_reason
--    FROM system.mutations
--    WHERE database = 'default' AND table = 'match_player'
--      AND command LIKE '%item_stats_by_hero_mode_badge_v2%' AND NOT is_done;
--
--    -- b) no active part without v2 (catches parts a merge or insert produced without it)
--    SELECT partition, count() AS parts, sum(rows) AS rows
--    FROM system.parts
--    WHERE database = 'default' AND table = 'match_player' AND active
--      AND NOT startsWith(partition, 'patch')
--      AND NOT has(projections, 'item_stats_by_hero_mode_badge_v2')
--    GROUP BY partition ORDER BY partition;
--
--    If (b) lists any partitions, first re-run step 1 for exactly those partitions.
--
--    Dropping v1 is a cheap mutation: it deletes the projection directories (~74 GiB freed)
--    and rewrites no data. It also halves this projection's per-insert and per-merge cost. No
--    code names v1. Every query that could use it (hero_stats, ability_order, item_stats with
--    a hero filter, ...) is served by v2, which has the same ORDER BY and a superset of v1's
--    columns.
ALTER TABLE default.match_player DROP PROJECTION IF EXISTS item_stats_by_hero_mode_badge;
