use itertools::Itertools;

#[cfg_attr(test, derive(Debug, proptest_derive::Arbitrary))]
pub(super) struct MatchInfoFilters {
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
    pub(super) fn build(&self) -> String {
        self.build_with_prefix("")
    }

    /// Same as [`Self::build`] but qualifies every column reference with the given
    /// prefix (e.g. `"mp."`). Use when the surrounding query joins another table
    /// that also has columns named `match_id`/`start_time`/etc.
    pub(super) fn build_with_prefix(&self, prefix: &str) -> String {
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
            && v > 11
        {
            filters.push(format!(
                "{prefix}average_badge_team0 >= {v} AND {prefix}average_badge_team1 >= {v}"
            ));
        }
        if let Some(v) = self.max_average_badge
            && v < 116
        {
            filters.push(format!(
                "{prefix}average_badge_team0 <= {v} AND {prefix}average_badge_team1 <= {v}"
            ));
        }
        if let Some(v) = self.min_duration_s {
            filters.push(format!("{prefix}duration_s >= {v}"));
        }
        if let Some(v) = self.max_duration_s {
            filters.push(format!("{prefix}duration_s <= {v}"));
        }
        if filters.is_empty() {
            String::new()
        } else {
            format!(" AND {}", filters.join(" AND "))
        }
    }
}

/// Common player-level filters shared across analytics queries.
/// Returns a `Vec<String>` so callers can extend with file-specific filters
/// before formatting.
#[derive(Default)]
pub(super) struct PlayerFilters<'a> {
    pub account_id: Option<u32>,
    pub account_ids: Option<&'a [u32]>,
    pub hero_id: Option<u32>,
    pub hero_ids: Option<&'a [u32]>,
    pub min_networth: Option<u64>,
    pub max_networth: Option<u64>,
    pub include_item_ids: Option<&'a [u32]>,
    pub exclude_item_ids: Option<&'a [u32]>,
}

impl PlayerFilters<'_> {
    pub(super) fn build(&self) -> Vec<String> {
        let mut filters = vec![];
        if let Some(hero_id) = self.hero_id {
            filters.push(format!("hero_id = {hero_id}"));
        }
        if let Some(hero_ids) = self.hero_ids
            && !hero_ids.is_empty()
        {
            filters.push(format!(
                "hero_id IN ({})",
                hero_ids.iter().map(ToString::to_string).join(", ")
            ));
        }
        if let Some(account_id) = self.account_id {
            filters.push(format!("account_id = {account_id}"));
        }
        if let Some(account_ids) = self.account_ids {
            filters.push(format!(
                "account_id IN ({})",
                account_ids.iter().map(ToString::to_string).join(", ")
            ));
        }
        if let Some(v) = self.min_networth {
            filters.push(format!("net_worth >= {v}"));
        }
        if let Some(v) = self.max_networth {
            filters.push(format!("net_worth <= {v}"));
        }
        if let Some(ids) = self.include_item_ids {
            filters.push(format!(
                "hasAll(items.item_id, [{}])",
                ids.iter().map(ToString::to_string).join(", ")
            ));
        }
        if let Some(ids) = self.exclude_item_ids {
            filters.push(format!(
                "not hasAny(items.item_id, [{}])",
                ids.iter().map(ToString::to_string).join(", ")
            ));
        }
        filters
    }
}

/// Formats a filter vec as ` AND ...` or empty string.
pub(super) fn join_filters(filters: &[String]) -> String {
    if filters.is_empty() {
        String::new()
    } else {
        format!(" AND {}", filters.join(" AND "))
    }
}

/// Rounds timestamps to hourly boundaries for cache-friendliness.
pub(super) fn round_timestamps(
    min_unix_timestamp: &mut Option<i64>,
    max_unix_timestamp: &mut Option<i64>,
) {
    *min_unix_timestamp = min_unix_timestamp.map(|v| v - v % 3600);
    *max_unix_timestamp = max_unix_timestamp.map(|v| v + 3600 - v % 3600);
}

pub(super) const DEFAULT_MIN_MATCHES: u64 = 20;

#[allow(clippy::unnecessary_wraps, clippy::cast_possible_truncation)]
pub(super) fn default_min_matches_u32() -> Option<u32> {
    Some(DEFAULT_MIN_MATCHES as u32)
}

#[allow(clippy::unnecessary_wraps)]
pub(super) fn default_min_matches_u64() -> Option<u64> {
    Some(DEFAULT_MIN_MATCHES)
}

/// Filters out protected users from `account_ids` and checks a single `account_id`.
/// Returns an error if all requested accounts are protected.
pub(super) async fn filter_protected_accounts(
    state: &crate::context::AppState,
    account_ids: &mut Option<Vec<u32>>,
    account_id: Option<u32>,
) -> crate::error::APIResult<()> {
    if let Some(ids) = account_ids.take() {
        let protected_users = state
            .steam_client
            .get_protected_users(&state.pg_client)
            .await?;
        let filtered: Vec<_> = ids
            .into_iter()
            .filter(|id| !protected_users.contains(id))
            .collect();
        if filtered.is_empty() {
            return Err(crate::error::APIError::protected_user());
        }
        *account_ids = Some(filtered);
    }
    if let Some(id) = account_id
        && state
            .steam_client
            .is_user_protected(&state.pg_client, id)
            .await?
    {
        return Err(crate::error::APIError::protected_user());
    }
    Ok(())
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
    fn test_round_timestamps() {
        let mut min = Some(1_672_531_400_i64); // not on boundary
        let mut max = Some(1_672_531_400_i64);
        round_timestamps(&mut min, &mut max);
        assert_eq!(min, Some(1_672_531_200)); // floored
        assert_eq!(max, Some(1_672_534_800)); // ceiled to next hour

        let mut min_none: Option<i64> = None;
        let mut max_none: Option<i64> = None;
        round_timestamps(&mut min_none, &mut max_none);
        assert_eq!(min_none, None);
        assert_eq!(max_none, None);
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::{assert_valid_and_fragment, assert_valid_predicate_vec};

    prop_compose! {
        fn arb_player_filter_inputs()(
            account_id in any::<Option<u32>>(),
            account_ids in prop::option::of(prop::collection::vec(any::<u32>(), 0..16)),
            hero_id in any::<Option<u32>>(),
            hero_ids in prop::option::of(prop::collection::vec(any::<u32>(), 0..16)),
            min_networth in any::<Option<u64>>(),
            max_networth in any::<Option<u64>>(),
            include_item_ids in prop::option::of(prop::collection::vec(any::<u32>(), 0..16)),
            exclude_item_ids in prop::option::of(prop::collection::vec(any::<u32>(), 0..16)),
        ) -> (
            Option<u32>, Option<Vec<u32>>,
            Option<u32>, Option<Vec<u32>>,
            Option<u64>, Option<u64>,
            Option<Vec<u32>>, Option<Vec<u32>>,
        ) {
            (account_id, account_ids, hero_id, hero_ids, min_networth, max_networth, include_item_ids, exclude_item_ids)
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig { cases: 64, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn match_info_filters_emit_valid_sql(filters: MatchInfoFilters) {
            assert_valid_and_fragment(&filters.build());
        }

        #[test]
        fn player_filters_emit_valid_sql(params in arb_player_filter_inputs()) {
            let (account_id, account_ids, hero_id, hero_ids, min_networth, max_networth, include_item_ids, exclude_item_ids) = params;
            let filters = PlayerFilters {
                account_id,
                account_ids: account_ids.as_deref(),
                hero_id,
                hero_ids: hero_ids.as_deref(),
                min_networth,
                max_networth,
                include_item_ids: include_item_ids.as_deref(),
                exclude_item_ids: exclude_item_ids.as_deref(),
            };
            assert_valid_predicate_vec(&filters.build());
        }
    }
}
