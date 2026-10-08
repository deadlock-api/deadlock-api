use itertools::Itertools;

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

/// A `min_average_badge` at or below this keeps every badge, so no predicate is emitted.
pub(crate) const MIN_FILTERING_AVERAGE_BADGE: u8 = 11;
/// A `max_average_badge` at or above this keeps every badge, so no predicate is emitted.
pub(crate) const MAX_FILTERING_AVERAGE_BADGE: u8 = 116;

/// Duration column of `match_player`, `match_info` and `player_match_stats`.
pub(crate) const DURATION_COLUMN: &str = "duration_s";
/// Duration column of `player_match_roster`.
pub(crate) const ROSTER_DURATION_COLUMN: &str = "match_duration_s";

/// Match-level time, id, badge and duration filters shared by most match queries.
#[cfg_attr(test, derive(Debug, proptest_derive::Arbitrary))]
pub(crate) struct MatchInfoFilters {
    pub min_unix_timestamp: Option<i64>,
    pub max_unix_timestamp: Option<i64>,
    pub min_match_id: Option<u64>,
    pub max_match_id: Option<u64>,
    pub min_average_badge: Option<u8>,
    pub max_average_badge: Option<u8>,
    pub min_duration_s: Option<u64>,
    pub max_duration_s: Option<u64>,
}

impl MatchInfoFilters {
    /// Builds the SQL `AND ...` clause for `match_info` filters.
    /// Returns an empty string when no filters are set.
    pub(crate) fn build(&self) -> String {
        self.build_with_prefix("")
    }

    /// Same as [`Self::build`] but qualifies every column reference with the given
    /// prefix (e.g. `"mp."`). Use when the surrounding query joins another table
    /// that also has columns named `match_id`/`start_time`/etc.
    pub(crate) fn build_with_prefix(&self, prefix: &str) -> String {
        join_filters(&self.predicates(prefix, DURATION_COLUMN))
    }

    /// The individual predicates, with every column qualified by `prefix` and the match duration
    /// read from `duration_column`.
    pub(crate) fn predicates(&self, prefix: &str, duration_column: &str) -> Vec<String> {
        let mut filters = Vec::new();
        if let Some(v) = self.min_unix_timestamp {
            filters.push(format!("{prefix}start_time >= {v}"));
        }
        if let Some(v) = self.max_unix_timestamp {
            filters.push(format!("{prefix}start_time <= {v}"));
        }
        if let Some(v) = self.min_match_id {
            filters.push(format!("{prefix}match_id >= {v}"));
        }
        if let Some(v) = self.max_match_id {
            filters.push(format!("{prefix}match_id <= {v}"));
        }
        if let Some(v) = self.min_average_badge
            && v > MIN_FILTERING_AVERAGE_BADGE
        {
            filters.push(average_badge_filter(
                &format!("{prefix}average_badge"),
                ">=",
                v,
            ));
        }
        if let Some(v) = self.max_average_badge
            && v < MAX_FILTERING_AVERAGE_BADGE
        {
            filters.push(average_badge_filter(
                &format!("{prefix}average_badge"),
                "<=",
                v,
            ));
        }
        if let Some(v) = self.min_duration_s {
            filters.push(format!("{prefix}{duration_column} >= {v}"));
        }
        if let Some(v) = self.max_duration_s {
            filters.push(format!("{prefix}{duration_column} <= {v}"));
        }
        filters
    }
}

/// Matchmaking pool flags of `match_player`/`match_info`.
#[derive(Default, Clone, Copy)]
#[cfg_attr(test, derive(Debug, proptest_derive::Arbitrary))]
#[expect(clippy::struct_field_names)]
pub(crate) struct MatchPoolFilters {
    pub is_high_skill_range_parties: Option<bool>,
    pub is_low_pri_pool: Option<bool>,
    pub is_new_player_pool: Option<bool>,
}

impl MatchPoolFilters {
    pub(crate) fn is_empty(self) -> bool {
        self.is_high_skill_range_parties.is_none()
            && self.is_low_pri_pool.is_none()
            && self.is_new_player_pool.is_none()
    }

    pub(crate) fn predicates(self) -> Vec<String> {
        let mut filters = Vec::new();
        if let Some(v) = self.is_high_skill_range_parties {
            filters.push(format!("is_high_skill_range_parties = {v}"));
        }
        if let Some(v) = self.is_low_pri_pool {
            filters.push(format!("low_pri_pool = {v}"));
        }
        if let Some(v) = self.is_new_player_pool {
            filters.push(format!("new_player_pool = {v}"));
        }
        filters
    }
}

/// Comma separated list of ids for an SQL `IN (...)` or array literal.
pub(crate) fn id_list<T: core::fmt::Display>(ids: &[T]) -> String {
    ids.iter().map(ToString::to_string).join(", ")
}

/// Formats a filter vec as ` AND ...` or empty string.
pub(crate) fn join_filters(filters: &[String]) -> String {
    if filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", filters.join(" AND "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_filters() {
        let filters = MatchInfoFilters {
            min_unix_timestamp: None,
            max_unix_timestamp: None,
            min_match_id: None,
            max_match_id: None,
            min_average_badge: None,
            max_average_badge: None,
            min_duration_s: None,
            max_duration_s: None,
        };
        assert_eq!(filters.build(), "");
    }

    #[test]
    fn test_badge_boundary_min_ignored_at_11() {
        let filters = MatchInfoFilters {
            min_unix_timestamp: None,
            max_unix_timestamp: None,
            min_match_id: None,
            max_match_id: None,
            min_average_badge: Some(11),
            max_average_badge: None,
            min_duration_s: None,
            max_duration_s: None,
        };
        assert_eq!(filters.build(), "");
    }

    #[test]
    fn test_badge_boundary_max_ignored_at_116() {
        let filters = MatchInfoFilters {
            min_unix_timestamp: None,
            max_unix_timestamp: None,
            min_match_id: None,
            max_match_id: None,
            min_average_badge: None,
            max_average_badge: Some(116),
            min_duration_s: None,
            max_duration_s: None,
        };
        assert_eq!(filters.build(), "");
    }

    #[test]
    fn test_roster_duration_column() {
        let filters = MatchInfoFilters {
            min_unix_timestamp: None,
            max_unix_timestamp: None,
            min_match_id: None,
            max_match_id: None,
            min_average_badge: None,
            max_average_badge: None,
            min_duration_s: Some(1),
            max_duration_s: Some(2),
        };
        assert_eq!(
            filters.predicates("", ROSTER_DURATION_COLUMN),
            ["match_duration_s >= 1", "match_duration_s <= 2"]
        );
    }

    #[test]
    fn test_pool_filters() {
        let pool = MatchPoolFilters {
            is_high_skill_range_parties: Some(true),
            is_low_pri_pool: Some(false),
            is_new_player_pool: None,
        };
        assert!(!pool.is_empty());
        assert_eq!(
            pool.predicates(),
            ["is_high_skill_range_parties = true", "low_pri_pool = false"]
        );
        assert!(MatchPoolFilters::default().is_empty());
    }

    #[test]
    fn test_average_badge_filter() {
        assert_eq!(
            average_badge_filter("mi.average_badge", ">=", 91),
            "mi.average_badge >= 91 AND ifNull(mi.average_badge, 0) >= 91"
        );
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::{assert_valid_and_fragment, assert_valid_predicate_vec};

    proptest! {
        #![proptest_config(ProptestConfig { cases: 64, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn match_info_filters_emit_valid_sql(filters: MatchInfoFilters) {
            assert_valid_and_fragment(&filters.build());
        }

        #[test]
        fn match_pool_filters_emit_valid_sql(filters: MatchPoolFilters) {
            assert_valid_predicate_vec(&filters.predicates());
        }
    }
}
