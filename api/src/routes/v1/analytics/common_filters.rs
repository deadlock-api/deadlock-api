use core::fmt::Display;

use crate::utils::parse::MIN_DEMO_PLAYER_TIMESTAMP;
use crate::utils::sql::{MAX_FILTERING_AVERAGE_BADGE, MIN_FILTERING_AVERAGE_BADGE};
pub(super) use crate::utils::sql::{MatchInfoFilters, id_list, join_filters};
use itertools::Itertools;
use serde::Deserialize;
use strum::Display;
use utoipa::ToSchema;

/// Bit of `items.upgrade_info` marking a corrupted item (build 6712+): the Broker swaps
/// a T3/T4 upgrade for a corrupted version that keeps the normal item's `item_id`. Only
/// ever test this bit; the other bits changed with the patch (0x10001 -> 0x10000).
pub(super) const CORRUPTED_ITEM_BIT: u32 = 0x80_0000;

/// SQL predicate that is true for non-corrupted purchases, given an expression for the
/// purchase's `upgrade_info` value.
pub(super) fn not_corrupted_sql(upgrade_info_expr: &str) -> String {
    format!("bitAnd({upgrade_info_expr}, {CORRUPTED_ITEM_BIT}) = 0")
}

/// SQL predicate that is true for corrupted purchases, given an expression for the
/// purchase's `upgrade_info` value.
pub(super) fn corrupted_sql(upgrade_info_expr: &str) -> String {
    format!("bitAnd({upgrade_info_expr}, {CORRUPTED_ITEM_BIT}) != 0")
}

/// No match starting before this can contain a corrupted item: build 6712 went live on
/// 2026-09-29 and the first corrupted purchase on record is in a match that started at
/// 20:35:08 UTC. This is 2026-09-29 20:00:00 UTC, a safety margin before that.
pub(super) const CORRUPTED_ITEMS_MIN_UNIX_TIMESTAMP: i64 = 1_790_712_000;
/// Lower bound on the match id of any match that can contain a corrupted item (the first one on
/// record is `108_540_105`). `match_player` is partitioned by `intDiv(match_id, 1e6)`, so this
/// is the first id of partition 108. A `match_id >=` bound prunes whole partitions, which
/// also works for the hero-led projection; that projection cannot prune by `start_time`.
pub(super) const CORRUPTED_ITEMS_MIN_MATCH_ID: u64 = 108_000_000;

/// Bit of `items.upgrade_info` marking an enhanced item in Street Brawl: some draft picks
/// are the enhanced version of an upgrade, which keeps the normal item's `item_id`. Never
/// set outside Street Brawl.
pub(super) const ENHANCED_ITEM_BIT: u32 = 0x2_0000;

/// SQL predicate that is true for enhanced purchases, given an expression for the
/// purchase's `upgrade_info` value.
pub(super) fn enhanced_sql(upgrade_info_expr: &str) -> String {
    format!("bitAnd({upgrade_info_expr}, {ENHANCED_ITEM_BIT}) != 0")
}

/// SQL predicate that is true for non-enhanced purchases, given an expression for the
/// purchase's `upgrade_info` value.
pub(super) fn not_enhanced_sql(upgrade_info_expr: &str) -> String {
    format!("bitAnd({upgrade_info_expr}, {ENHANCED_ITEM_BIT}) = 0")
}

/// `items.upgrade_info` is 0 for every purchase before this, so enhanced items cannot be
/// told apart in older matches. The first enhanced purchase on record is in match
/// `74_174_026`, which started at 2026-04-08 22:39:04 UTC. This is 2026-04-08 22:00:00 UTC.
pub(super) const ENHANCED_ITEMS_MIN_UNIX_TIMESTAMP: i64 = 1_775_685_600;
/// Lower bound on the match id of any match with a known enhanced flag: the first id of
/// partition 74 (see [`CORRUPTED_ITEMS_MIN_MATCH_ID`]).
pub(super) const ENHANCED_ITEMS_MIN_MATCH_ID: u64 = 74_000_000;

/// How the match-level analytics group their rows: by the match's start time or badge.
#[derive(Debug, Clone, Copy, Deserialize, ToSchema, Default, Display, PartialEq, Eq, Hash)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(crate) enum BucketQuery {
    /// No Bucketing
    #[default]
    NoBucket,
    /// Bucket By Max Average Badge Level (tier = first digits, subtier = last digit) of both teams involved. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    AvgBadge,
    /// Bucket By Start Time (Hour)
    StartTimeHour,
    /// Bucket By Start Time (Day)
    StartTimeDay,
    /// Bucket By Start Time (Week)
    StartTimeWeek,
    /// Bucket By Start Time (Month)
    StartTimeMonth,
}

impl BucketQuery {
    /// The bucket expression against `match_player` (or a table with its column names).
    pub(crate) fn base_expr(self) -> &'static str {
        match self {
            Self::NoBucket => "toUInt32(0)",
            Self::AvgBadge => "toUInt32(assumeNotNull(coalesce(average_badge, 0)))",
            Self::StartTimeHour => "toStartOfHour(start_time)",
            Self::StartTimeDay => "toStartOfDay(start_time)",
            Self::StartTimeWeek => "toDateTime(toStartOfWeek(start_time))",
            Self::StartTimeMonth => "toDateTime(toStartOfMonth(start_time))",
        }
    }

    /// The bucket expression against a day-grained rollup with `least_badge`/`greatest_badge`
    /// columns (`hero_stats_agg_v2`, `game_stats_agg`), or `None` for `StartTimeHour`, which
    /// needs the sub-day resolution a `day` grain does not keep. `AvgBadge` buckets by the
    /// per-match `greatest_badge`, stored as 65535 when NULL, which maps back to 0 to mirror
    /// [`Self::base_expr`]'s `coalesce(..., 0)`.
    pub(super) fn mv_bucket_expr(self) -> Option<&'static str> {
        match self {
            Self::NoBucket => Some("toUInt32(0)"),
            Self::AvgBadge => Some("toUInt32(if(greatest_badge = 65535, 0, greatest_badge))"),
            Self::StartTimeDay => Some("toStartOfDay(toDateTime(day))"),
            Self::StartTimeWeek => Some("toDateTime(toStartOfWeek(day))"),
            Self::StartTimeMonth => Some("toDateTime(toStartOfMonth(day))"),
            Self::StartTimeHour => None,
        }
    }
}

/// SQL predicate that is true when the player owned item `id`.
///
/// For shop items it reads `upgrades.item_id`, the shop-item subset of `items.item_id`, which is
/// 2.3x smaller (bytes read -26..-51%, CPU -29..-47% on 30-day item-filtered scans). It drops
/// corrupted and `game_time_s = 0` entries, which almost never come without a regular entry of the
/// same id: 42 of 391M rows on 2026-10-22, 40 of them private lobbies handing out items at 0 s.
/// First purchase times agreed on every row. Other ids (abilities) keep `items.item_id`.
/// `dictHas` on a constant folds at analysis, so only the chosen column is read. No projection
/// carries `upgrades.*`: only use this where projections are off.
pub(super) fn item_owned_sql(id: u32) -> String {
    format!(
        "if(dictHas('default.upgrade_items_dict', toUInt64({id})), has(upgrades.item_id, {id}), \
         has(items.item_id, {id}))"
    )
}

/// SQL expression for the player's first purchase time of item `id` (0 if never bought), read
/// like [`item_owned_sql`].
pub(super) fn item_first_buy_sql(id: u32) -> String {
    format!(
        "if(dictHas('default.upgrade_items_dict', toUInt64({id})), \
         arrayElement(upgrades.game_time_s, indexOf(upgrades.item_id, {id})), \
         arrayElement(items.game_time_s, indexOf(items.item_id, {id})))"
    )
}

/// Common player-level filters shared across analytics queries.
/// Returns a `Vec<String>` so callers can extend with file-specific filters
/// before formatting.
#[derive(Default, Clone, Copy)]
pub(super) struct PlayerFilters<'a> {
    pub account_id: Option<u32>,
    pub account_ids: Option<&'a [u32]>,
    pub hero_id: Option<u32>,
    pub hero_ids: Option<&'a [u32]>,
    pub min_networth: Option<u64>,
    pub max_networth: Option<u64>,
    pub include_item_ids: Option<&'a [u32]>,
    pub exclude_item_ids: Option<&'a [u32]>,
    /// Test item ownership with [`item_owned_sql`] instead of `items.item_id`. Only for queries
    /// that never read a projection (FINAL or `optimize_use_projections = 0`): the projections
    /// carry `items.item_id` but no `upgrades.*`.
    pub items_from_upgrades: bool,
    pub ability_order_prefix: Option<&'a [u32]>,
    pub ability_unlock_order_prefix: Option<&'a [u32]>,
    /// The hero build the player had selected when the match started. Only demo-processed matches record one, and the
    /// rollups have no build dimension: an endpoint that takes it must read the base table when it is set.
    pub hero_build_id: Option<u64>,
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
            filters.push(format!("hero_id IN ({})", id_list(hero_ids)));
        }
        if let Some(account_id) = self.account_id {
            filters.push(format!("account_id = {account_id}"));
        }
        if let Some(account_ids) = self.account_ids {
            filters.push(format!("account_id IN ({})", id_list(account_ids)));
        }
        filters.extend(range_filters(
            "net_worth",
            self.min_networth,
            self.max_networth,
        ));
        if let Some(ids) = self.include_item_ids {
            if self.items_from_upgrades {
                filters.extend(ids.iter().map(|&id| item_owned_sql(id)));
            } else {
                filters.push(format!("hasAll(items.item_id, [{}])", id_list(ids)));
            }
        }
        if let Some(ids) = self.exclude_item_ids {
            if self.items_from_upgrades {
                filters.extend(ids.iter().map(|&id| format!("not {}", item_owned_sql(id))));
            } else {
                filters.push(format!("not hasAny(items.item_id, [{}])", id_list(ids)));
            }
        }
        if let Some(ids) = self.ability_order_prefix
            && !ids.is_empty()
        {
            filters.push(ability_order_prefix_filter(ids));
        }
        if let Some(ids) = self.ability_unlock_order_prefix
            && !ids.is_empty()
        {
            filters.push(ability_unlock_order_prefix_filter(ids));
        }
        if let Some(hero_build_id) = self.hero_build_id {
            filters.push(format!("hero_build_id = {hero_build_id}"));
        }
        filters
    }
}

/// `{column} >= {min}` and `{column} <= {max}`, for the bounds that are set.
pub(super) fn range_filters(
    column: &str,
    min: Option<impl Display>,
    max: Option<impl Display>,
) -> Vec<String> {
    let mut filters = Vec::with_capacity(2);
    if let Some(v) = min {
        filters.push(format!("{column} >= {v}"));
    }
    if let Some(v) = max {
        filters.push(format!("{column} <= {v}"));
    }
    filters
}

/// Whether an optional id list is set and non-empty.
pub(super) fn is_non_empty<T>(ids: Option<&[T]>) -> bool {
    ids.is_some_and(|ids| !ids.is_empty())
}

/// Folds a deprecated single-id parameter into its list counterpart.
pub(super) fn with_legacy_id(ids: Option<&[u32]>, legacy_id: Option<u32>) -> Vec<u32> {
    ids.unwrap_or_default()
        .iter()
        .copied()
        .chain(legacy_id)
        .collect()
}

/// Safety margin below a day-grained rollup's horizon: only route windows whose start sits
/// comfortably inside the materialized range, so a just-refreshed edge (the rollup drops the
/// oldest day as time advances) never under-serves a request.
const ROLLUP_ROUTING_MARGIN_DAYS: i64 = 5;

/// The earliest `min_unix_timestamp` a rollup holding the last `horizon_days` days serves, or
/// `None` when the clock is before the Unix epoch.
pub(super) fn rollup_oldest_servable(horizon_days: i64) -> Option<i64> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs()
        .cast_signed();
    Some(now - (horizon_days - ROLLUP_ROUTING_MARGIN_DAYS) * 86_400)
}

/// Badge filters on a rollup's per-match `least_badge`/`greatest_badge` columns. They mirror the
/// base table's both-teams semantics, with the same no-op guards as [`MatchInfoFilters`]. NULL
/// badges are stored as 0 / 65535, so any active filter excludes them just like the base table.
pub(super) fn rollup_badge_filters(
    min_average_badge: Option<u8>,
    max_average_badge: Option<u8>,
) -> Vec<String> {
    badge_filters(
        "least_badge",
        "greatest_badge",
        min_average_badge,
        max_average_badge,
    )
}

/// [`rollup_badge_filters`] on the `match_player` expressions the rollups compute their badge
/// columns from.
pub(super) fn rollup_badge_base_filters(
    min_average_badge: Option<u8>,
    max_average_badge: Option<u8>,
) -> Vec<String> {
    badge_filters(
        "ifNull(average_badge, 0)",
        "ifNull(average_badge, 65535)",
        min_average_badge,
        max_average_badge,
    )
}

fn badge_filters(
    least: &str,
    greatest: &str,
    min_average_badge: Option<u8>,
    max_average_badge: Option<u8>,
) -> Vec<String> {
    let mut filters = Vec::new();
    if let Some(v) = min_average_badge.filter(|&v| v > MIN_FILTERING_AVERAGE_BADGE) {
        filters.push(format!("{least} >= {v}"));
    }
    if let Some(v) = max_average_badge.filter(|&v| v < MAX_FILTERING_AVERAGE_BADGE) {
        filters.push(format!("{greatest} <= {v}"));
    }
    filters
}

/// `match_id IN (SELECT ... FROM player_match_stats ...)` for account-scoped reads of
/// `match_player`, or `None` without an account filter.
///
/// An `account_id` predicate on `match_player` is served by its bloom-filter skip index, which
/// visits every part, and a hero filter on top makes the planner pick a hero-sorted projection
/// that brute-forces the account filter over the hero's rows. The `match_id` set is a primary-key
/// range on `player_match_stats` and a primary-key lookup on `match_player` (measured -85% to
/// -95% CPU, identical rows). The subquery repeats every filter `player_match_stats` can
/// evaluate, so it only ever narrows to matches the outer predicate keeps anyway.
pub(super) fn account_match_prefilter(
    player_filters: PlayerFilters<'_>,
    info_filters: &MatchInfoFilters,
    match_mode_filter: &str,
    game_mode_filter: &str,
) -> Option<String> {
    let has_account_filter = player_filters.account_id.is_some()
        || player_filters
            .account_ids
            .is_some_and(|ids| !ids.is_empty());
    if !has_account_filter {
        return None;
    }
    // Only the filters on columns `player_match_stats` has.
    let stats_filters = PlayerFilters {
        account_id: player_filters.account_id,
        account_ids: player_filters.account_ids,
        hero_id: player_filters.hero_id,
        hero_ids: player_filters.hero_ids,
        min_networth: player_filters.min_networth,
        max_networth: player_filters.max_networth,
        ..Default::default()
    }
    .build();
    Some(format!(
        "match_id IN (SELECT match_id FROM player_match_stats WHERE {match_mode_filter} AND {game_mode_filter}{}{})",
        info_filters.build(),
        join_filters(&stats_filters)
    ))
}

/// Players whose ability point spends (`match_player.abilities`, in spend order) start with
/// exactly `ids`.
pub(super) fn ability_order_prefix_filter(ids: &[u32]) -> String {
    format!(
        "arraySlice(abilities, 1, {}) = [{}]",
        ids.len(),
        id_list(ids)
    )
}

/// Players whose abilities were first put a point into (unlocked) in exactly the order `ids`,
/// i.e. a prefix match on the first occurrence of each ability. `arrayDistinct` keeps
/// first-occurrence order.
pub(super) fn ability_unlock_order_prefix_filter(ids: &[u32]) -> String {
    format!(
        "arraySlice(arrayDistinct(abilities), 1, {}) = [{}]",
        ids.len(),
        id_list(ids)
    )
}

/// Scopes a duo-versus-duo lane query to the requested accounts and hero pairings.
pub(super) struct LaneDuoFilters<'a> {
    pub accounts: Option<&'a [u32]>,
    pub heroes: Option<&'a [u32]>,
    pub enemy_heroes: Option<&'a [u32]>,
}

pub(super) struct LaneDuoFilterSql {
    /// ` AND ...` restricting the scanned matches, applied before the per-lane `GROUP BY`.
    pub account_prefilter: String,
    /// ` AND ...` restricting the scanned players, applied before the per-lane `GROUP BY`.
    pub hero_prefilter: String,
    /// Heroes every surviving matchup must contain, for the match-level prefilter in
    /// [`super::lane_common::LaneScanFilters`]. Empty when the player prefilter is active.
    pub required_heroes: Vec<u32>,
    /// ` AND ...` on the `duo`/`enemy_duo` arrays of the per-side `ARRAY JOIN`. Deliberately not on
    /// the `hero_ids`/`enemy_hero_ids` output columns: those disappear when the caller groups them
    /// away, and the filter has to survive that.
    pub duo_filters: String,
}

impl LaneDuoFilters<'_> {
    pub(super) fn build(&self) -> LaneDuoFilterSql {
        let account_prefilter = self.accounts.map_or_else(String::new, |ids| {
            format!(
                " AND match_id IN (SELECT match_id FROM match_player WHERE account_id IN ({}))",
                id_list(ids)
            )
        });

        // Dropping players before the GROUP BY is sound only with both lists set as pools: every
        // player of a surviving lane is then in their union, so the prefilter cannot truncate a duo
        // we still want. A single hero leaves its partner unconstrained.
        let hero_scope = match (self.heroes, self.enemy_heroes) {
            (Some(hero_ids), Some(enemy_hero_ids))
                if hero_ids.len() > 1 && enemy_hero_ids.len() > 1 =>
            {
                hero_ids.iter().chain(enemy_hero_ids).copied().collect_vec()
            }
            _ => vec![],
        };
        let hero_prefilter = join_filters(
            &PlayerFilters {
                hero_ids: Some(&hero_scope),
                ..Default::default()
            }
            .build(),
        );

        // Without the player prefilter nothing above narrows the scan, so the match-level prefilter
        // is what keeps it from aggregating every match in the window. With it the extra subquery
        // costs more than it saves (measured +27% wall time). Only lists of at most two heroes
        // pin down heroes a matchup must contain: a larger pool is satisfied by any two of them.
        let required_heroes = if hero_scope.is_empty() {
            [self.heroes, self.enemy_heroes]
                .into_iter()
                .flatten()
                .filter(|ids| ids.len() <= 2)
                .flatten()
                .copied()
                .unique()
                .collect_vec()
        } else {
            vec![]
        };

        LaneDuoFilterSql {
            account_prefilter,
            hero_prefilter,
            required_heroes,
            duo_filters: self.side_filters("duo", "enemy_duo"),
        }
    }

    /// ` AND ...` on two hero-pair array columns: `duo` must match `heroes`, `enemy_duo`
    /// `enemy_heroes`.
    pub(super) fn side_filters(&self, duo: &str, enemy_duo: &str) -> String {
        let filters = [(self.heroes, duo), (self.enemy_heroes, enemy_duo)]
            .into_iter()
            .filter_map(|(hero_ids, duo)| hero_ids.map(|ids| duo_filter(ids, duo)))
            .collect_vec();
        join_filters(&filters)
    }
}

/// A single hero means the duo includes it; two or more are the pool both duo members come from.
fn duo_filter(hero_ids: &[u32], duo: &str) -> String {
    let duo = format!("arrayMap(h -> toUInt32(h), {duo})");
    match hero_ids {
        [hero_id] => format!("has({duo}, {hero_id})"),
        _ => format!("hasAll([{}], {duo})", id_list(hero_ids)),
    }
}

/// Granularity [`round_timestamps`] widens a time range to.
pub(super) const TIMESTAMP_ALIGNMENT_S: i64 = 3600;

/// Widens a time range to whole hours for cache-friendliness: clients mostly send "now minus
/// 30 days" to the second, which would otherwise make every query string distinct. The minimum is
/// floored and the maximum ceiled; an already aligned bound stays where it is. A maximum at or
/// after now is dropped: no match starts in the future, so it filters nothing, and requests
/// sending one share a cache key with those sending none.
pub(super) fn round_timestamps(
    min_unix_timestamp: &mut Option<i64>,
    max_unix_timestamp: &mut Option<i64>,
) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs().cast_signed());
    round_timestamps_at(min_unix_timestamp, max_unix_timestamp, now);
}

fn round_timestamps_at(
    min_unix_timestamp: &mut Option<i64>,
    max_unix_timestamp: &mut Option<i64>,
    now: i64,
) {
    *min_unix_timestamp = min_unix_timestamp.map(floor_to_hour);
    *max_unix_timestamp = max_unix_timestamp
        .map(ceil_to_hour)
        .filter(|&max| max < now);
}

/// [`round_timestamps`] for endpoints reading demo-derived data, which does not exist before
/// [`MIN_DEMO_PLAYER_TIMESTAMP`]: the minimum is also clamped to it, and defaults to it when unset.
pub(super) fn round_demo_timestamps(
    min_unix_timestamp: &mut Option<i64>,
    max_unix_timestamp: &mut Option<i64>,
) {
    round_timestamps(min_unix_timestamp, max_unix_timestamp);
    *min_unix_timestamp = Some(min_unix_timestamp.map_or(MIN_DEMO_PLAYER_TIMESTAMP, |v| {
        v.max(MIN_DEMO_PLAYER_TIMESTAMP)
    }));
}

pub(super) fn floor_to_hour(v: i64) -> i64 {
    v.div_euclid(TIMESTAMP_ALIGNMENT_S)
        .saturating_mul(TIMESTAMP_ALIGNMENT_S)
}

pub(super) fn ceil_to_hour(v: i64) -> i64 {
    floor_to_hour(v.saturating_add(TIMESTAMP_ALIGNMENT_S - 1))
}

pub(super) const DEFAULT_MIN_MATCHES: u64 = 20;

#[expect(clippy::unnecessary_wraps, clippy::cast_possible_truncation)]
pub(super) fn default_min_matches_u32() -> Option<u32> {
    Some(DEFAULT_MIN_MATCHES as u32)
}

#[expect(clippy::unnecessary_wraps)]
pub(super) fn default_min_matches_u64() -> Option<u64> {
    Some(DEFAULT_MIN_MATCHES)
}

/// The most `account_ids` a request may filter on, as the parameters document.
pub(super) const MAX_ACCOUNT_IDS: usize = 1_000;

/// Filters out protected users from `account_ids` and checks a single `account_id`.
/// Returns an error if there are more than [`MAX_ACCOUNT_IDS`] or all requested accounts are
/// protected.
pub(super) async fn filter_protected_accounts(
    state: &crate::context::AppState,
    account_ids: &mut Option<Vec<u32>>,
    account_id: Option<u32>,
) -> crate::error::APIResult<()> {
    if account_ids
        .as_ref()
        .is_some_and(|ids| ids.len() > MAX_ACCOUNT_IDS)
    {
        return Err(crate::error::APIError::status_msg(
            axum::http::StatusCode::BAD_REQUEST,
            format!("Too many account IDs (max {MAX_ACCOUNT_IDS})."),
        ));
    }
    if account_ids.is_none() && account_id.is_none() {
        return Ok(());
    }
    let protected_users = state
        .steam_client
        .get_protected_users(&state.pg_client)
        .await?;
    if let Some(ids) = account_ids.take() {
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
        && protected_users.contains(&id)
    {
        return Err(crate::error::APIError::protected_user());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_prefilter_has_no_hero_build_filter() {
        // `player_match_stats` has no `hero_build_id` column, so the filter would fail the query.
        let filters = PlayerFilters {
            account_id: Some(1),
            hero_build_id: Some(2),
            ..Default::default()
        };
        let prefilter =
            account_match_prefilter(filters, &MatchInfoFilters::default(), "true", "true").unwrap();
        assert!(!prefilter.contains("hero_build_id"), "{prefilter}");
    }

    #[test]
    fn test_round_timestamps() {
        let mut min = Some(1_672_531_400_i64); // not on boundary
        let mut max = Some(1_672_531_400_i64);
        round_timestamps(&mut min, &mut max);
        assert_eq!(min, Some(1_672_531_200)); // floored
        assert_eq!(max, Some(1_672_534_800)); // ceiled to next hour

        // Aligned bounds stay put.
        let mut min = Some(1_672_531_200_i64);
        let mut max = Some(1_672_534_800_i64);
        round_timestamps(&mut min, &mut max);
        assert_eq!(min, Some(1_672_531_200));
        assert_eq!(max, Some(1_672_534_800));

        // Extremes neither overflow nor round the wrong way.
        let mut min = Some(-1_i64);
        let mut max = Some(i64::MAX);
        round_timestamps_at(&mut min, &mut max, i64::MAX);
        assert_eq!(min, Some(-3600));
        assert_eq!(max, Some(i64::MAX.div_euclid(3600) * 3600));
        let mut min = Some(i64::MIN);
        let mut max = Some(i64::MIN);
        round_timestamps(&mut min, &mut max);
        assert_eq!(min, Some(i64::MIN));
        assert_eq!(max, Some((i64::MIN.div_euclid(3600) + 1) * 3600));

        let mut min_none: Option<i64> = None;
        let mut max_none: Option<i64> = None;
        round_timestamps(&mut min_none, &mut max_none);
        assert_eq!(min_none, None);
        assert_eq!(max_none, None);

        // A maximum at or after now, once ceiled, is dropped; one before it is kept.
        let now = 1_672_534_800;
        for (max, expected) in [
            (now - 3600, Some(now - 3600)),
            (now - 3599, None),
            (now, None),
            (now + 86_400, None),
        ] {
            let mut min = Some(now - 86_400);
            let mut max = Some(max);
            round_timestamps_at(&mut min, &mut max, now);
            assert_eq!(min, Some(now - 86_400));
            assert_eq!(max, expected);
        }
        let mut min = Some(1_672_531_400_i64);
        let mut max = Some(i64::MAX);
        round_timestamps(&mut min, &mut max);
        assert_eq!(max, None);
    }
}

#[cfg(test)]
mod proptests {
    use proptest::prelude::*;

    use super::*;
    use crate::utils::proptest_utils::assert_valid_predicate_vec;

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
            ability_order_prefix in prop::option::of(prop::collection::vec(any::<u32>(), 0..16)),
            ability_unlock_order_prefix in prop::option::of(prop::collection::vec(any::<u32>(), 0..16)),
        ) -> (
            Option<u32>, Option<Vec<u32>>,
            Option<u32>, Option<Vec<u32>>,
            Option<u64>, Option<u64>,
            Option<Vec<u32>>, Option<Vec<u32>>,
            Option<Vec<u32>>, Option<Vec<u32>>,
        ) {
            (account_id, account_ids, hero_id, hero_ids, min_networth, max_networth, include_item_ids, exclude_item_ids, ability_order_prefix, ability_unlock_order_prefix)
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig { cases: 64, max_shrink_iters: 16, failure_persistence: None, .. ProptestConfig::default() })]

        #[test]
        fn player_filters_emit_valid_sql(params in arb_player_filter_inputs()) {
            let (account_id, account_ids, hero_id, hero_ids, min_networth, max_networth, include_item_ids, exclude_item_ids, ability_order_prefix, ability_unlock_order_prefix) = params;
            let filters = PlayerFilters {
                account_id,
                account_ids: account_ids.as_deref(),
                hero_id,
                hero_ids: hero_ids.as_deref(),
                min_networth,
                max_networth,
                include_item_ids: include_item_ids.as_deref(),
                exclude_item_ids: exclude_item_ids.as_deref(),
                // Both item sources; the inputs already vary an option.
                items_from_upgrades: hero_id.is_some(),
                ability_order_prefix: ability_order_prefix.as_deref(),
                ability_unlock_order_prefix: ability_unlock_order_prefix.as_deref(),
                // Any present or absent number; the inputs already vary one.
                hero_build_id: min_networth,
            };
            assert_valid_predicate_vec(&filters.build());
        }
    }
}
