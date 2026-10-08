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

/// Cache key of a query string: its 128-bit xxh3 hash. Keeping the hash instead of the string
/// bounds a cache entry's key at 16 bytes whatever the query length; a collision between two
/// distinct queries at 128 bits is not a practical concern.
pub(crate) fn query_cache_key(query_str: &str) -> u128 {
    xxhash_rust::xxh3::xxh3_128(query_str.as_bytes())
}

/// Declares an async fn `name(ch_client, query_str)` that runs a `ClickHouse` query and caches
/// the result per query string for `ttl_secs`, keeping at most `max_size` entries.
///
/// Concurrent misses of one query share a single run (`sync_writes = "by_key"`; the bucket lock
/// is also held on hits, so 1024 buckets keep unrelated queries apart). Rows come back in an
/// `Arc`, so a hit costs no deep clone. The key is [`query_cache_key`].
///
/// `fn name(max_size, ttl_secs) -> Vec<Row>;` fetches all rows. `fn name(max_size, ttl_secs) -> T
/// = fetch;` caches whatever `fetch(ch_client, query_str)` returns.
macro_rules! cached_ch_query {
    ($(#[$meta:meta])* $vis:vis fn $name:ident($size:literal, $ttl:literal) -> Vec<$row:ty>;) => {
        $(#[$meta])*
        #[::cached::macros::cached(
            max_size = $size,
            ttl_secs = $ttl,
            sync_writes = "by_key",
            sync_writes_buckets = 1024,
            convert = "{ crate::utils::sql::query_cache_key(query_str) }",
            key = "u128"
        )]
        $vis async fn $name(
            ch_client: &::clickhouse::Client,
            query_str: &str,
        ) -> ::clickhouse::error::Result<::std::sync::Arc<Vec<$row>>> {
            ch_client
                .query(query_str)
                .fetch_all()
                .await
                .map(::std::sync::Arc::new)
        }
    };
    ($(#[$meta:meta])* $vis:vis fn $name:ident($size:literal, $ttl:literal) -> $ret:ty = $fetch:path;) => {
        $(#[$meta])*
        #[::cached::macros::cached(
            max_size = $size,
            ttl_secs = $ttl,
            sync_writes = "by_key",
            sync_writes_buckets = 1024,
            convert = "{ crate::utils::sql::query_cache_key(query_str) }",
            key = "u128"
        )]
        $vis async fn $name(
            ch_client: &::clickhouse::Client,
            query_str: &str,
        ) -> ::clickhouse::error::Result<$ret> {
            $fetch(ch_client, query_str).await
        }
    };
}
pub(crate) use cached_ch_query;

/// Implements `match_info()` for a query struct that declares the match-info filter fields
/// (`min_unix_timestamp` .. `max_duration_s`) itself. The fields are kept on each struct rather
/// than in a `#[serde(flatten)]`ed one because flattening breaks number parsing from query strings.
/// `without_badge` is for structs without the `*_average_badge` fields.
macro_rules! impl_match_info {
    ($ty:ty) => {
        impl $ty {
            pub(crate) fn match_info(&self) -> $crate::utils::sql::MatchInfoFilters {
                $crate::utils::sql::MatchInfoFilters {
                    min_unix_timestamp: self.min_unix_timestamp,
                    max_unix_timestamp: self.max_unix_timestamp,
                    min_match_id: self.min_match_id,
                    max_match_id: self.max_match_id,
                    min_average_badge: self.min_average_badge,
                    max_average_badge: self.max_average_badge,
                    min_duration_s: self.min_duration_s,
                    max_duration_s: self.max_duration_s,
                }
            }
        }
    };
    ($ty:ty,without_badge) => {
        impl $ty {
            pub(crate) fn match_info(&self) -> $crate::utils::sql::MatchInfoFilters {
                $crate::utils::sql::MatchInfoFilters {
                    min_unix_timestamp: self.min_unix_timestamp,
                    max_unix_timestamp: self.max_unix_timestamp,
                    min_match_id: self.min_match_id,
                    max_match_id: self.max_match_id,
                    min_average_badge: None,
                    max_average_badge: None,
                    min_duration_s: self.min_duration_s,
                    max_duration_s: self.max_duration_s,
                }
            }
        }
    };
}
pub(crate) use impl_match_info;

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
    use core::fmt::Write;
    let mut out = String::new();
    for (i, id) in ids.iter().enumerate() {
        if i > 0 {
            out.push_str(", ");
        }
        let _ = write!(out, "{id}");
    }
    out
}

/// Formats `filters` as `HAVING ... AND ...`, or an empty string when there are none.
pub(crate) fn having_clause(filters: &[String]) -> String {
    if filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {}", filters.join(" AND "))
    }
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
    fn test_id_list() {
        assert_eq!(id_list::<u32>(&[]), "");
        assert_eq!(id_list(&[1_u32, 2, 3]), "1, 2, 3");
    }

    #[test]
    fn test_query_cache_key() {
        assert_eq!(query_cache_key("SELECT 1"), query_cache_key("SELECT 1"));
        assert_ne!(query_cache_key("SELECT 1"), query_cache_key("SELECT 2"));
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
