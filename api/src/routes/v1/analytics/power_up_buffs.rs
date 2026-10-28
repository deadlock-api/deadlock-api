//! Shared SQL for the `match_player.power_up_buffs` Nested column (power-up / "buff" pickups).
//!
//! Every row carries `type`, `value` (pickup count) and `is_permanent`, so pickup *counts* are
//! available for the whole history. Build 6712 ("City Never Sleeps", live since 2026-09-29
//! 20:50 UTC) added one game time (`pickup_times_s`) and one stat value
//! (`pickup_stat_values`) per pickup. Older rows keep empty inner arrays, and temporary
//! power-ups (`is_permanent = false`) never carry timings. Timing- and stat-based metrics
//! therefore only use rows with at least one timed permanent pickup, which excludes every
//! pre-update match.
//!
//! Migration 50 adds two `MATERIALIZED` scalar columns to `match_player` (and the same two
//! columns to `player_match_stats`), which the per-player aggregates read instead of the arrays:
//!
//! - `permanent_buffs UInt32`: permanent pickups of the player in the match.
//! - `first_permanent_buff_time_s Nullable(UInt32)`: game time of the first permanent pickup,
//!   `NULL` without a timed permanent pickup. `avg`/`count` skip the `NULL`s, which keeps
//!   pre-update rows out of every timing aggregate.
//!
//! No `match_player` projection carries the buff columns, so selecting them keeps the planner on
//! the base table (and its `start_time` index).

/// Game times (seconds) of every permanent pickup of one player in one match
/// (`Array(UInt32)`), empty for pre-update matches. Keep in sync with the
/// `first_permanent_buff_time_s` expression in migration 50.
pub(super) const PERMANENT_BUFF_TIMES: &str = "arrayFlatten(arrayFilter((t, p) -> p, \
     power_up_buffs.pickup_times_s, power_up_buffs.is_permanent))";
