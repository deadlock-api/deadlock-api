/// SQL predicate `{column} {op} {value}` on a Nullable `average_badge` column.
///
/// The comparison is combined with `AND` with the same comparison on `ifNull({column}, 0)`, which is the
/// badge key of the `match_player` projection `item_stats_by_hero_mode_badge_v2`. A plain
/// `average_badge >= X` cannot use that key, so the projection would only prune by
/// `hero_id`. The original comparison is kept, so NULL badges are still excluded (also for
/// `<=`). The key is only matched with `allow_key_condition_coalesce_rewrite = 0`, set on the
/// `ClickHouse` clients: the rewrite turns `ifNull(b, 0) >= X` into an `OR` that no longer
/// matches the key expression. Measured 3-5x fewer rows read on `item_stats` and
/// `player_stats_metrics`.
pub(crate) fn average_badge_filter(
    column: &str,
    op: &str,
    value: impl core::fmt::Display,
) -> String {
    format!("{column} {op} {value} AND ifNull({column}, 0) {op} {value}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_average_badge_filter() {
        assert_eq!(
            average_badge_filter("mi.average_badge", ">=", 91),
            "mi.average_badge >= 91 AND ifNull(mi.average_badge, 0) >= 91"
        );
    }
}
