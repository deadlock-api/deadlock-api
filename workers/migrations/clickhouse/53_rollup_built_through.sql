-- `built_through` on every rollup api/src/services/cohort_agg_refresh.rs builds.
--
-- The job now builds each day from the matches ingested up to a cap, and records that cap in
-- every row of the day partition, which it swaps in whole (REPLACE PARTITION). The item_stats
-- reads (`Coverage::Incremental` in api/src/routes/v1/analytics/rollup_window.rs) take the days
-- a rollup lacks, and the matches ingested after their day's cap, from match_player, so a
-- window may start before the rollups' horizon and still counts every ingested match.
--
-- The job inserts by position with `built_through` as the last column, so the running job
-- fails its inserts between this migration and the deploy of the code that writes the column
-- (and the new code fails before it): apply it right before that deploy. Until a day is
-- rebuilt its `built_through` is 0, which reads treat as a missing day, so results stay
-- exact while the job rebuilds, only slower.

ALTER TABLE default.item_stats_agg_v2 ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.item_stats_agg_v2_staging ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.item_cohort_stats_time_agg_v2 ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.item_cohort_stats_time_agg_v2_staging ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.item_cohort_stats_net_worth_agg_v2 ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.item_cohort_stats_net_worth_agg_v2_staging ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.item_enemy_stats_agg ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.item_enemy_stats_agg_staging ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.player_performance_curve_agg_v2 ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;
ALTER TABLE default.player_performance_curve_agg_v2_staging ADD COLUMN IF NOT EXISTS built_through SimpleAggregateFunction(max, DateTime) DEFAULT 0;

-- Forget the recorded build state, so the job's next cycles rebuild every day with a cap.
DELETE FROM default.cohort_agg_refresh_state WHERE table_name IN (
    'default.item_stats_agg_v2',
    'default.item_cohort_stats_time_agg_v2',
    'default.item_cohort_stats_net_worth_agg_v2',
    'default.item_enemy_stats_agg',
    'default.player_performance_curve_agg_v2'
);
