//! Cost model behind the schema's complexity limit.
//!
//! One complexity point is about 1 ms of `ClickHouse` CPU in the worst case the arguments allow,
//! calibrated against production on 2026-10-16. A list query costs what its `where` / `order_by`
//! make it scan ([`Scan`]) plus `limit` times the per-row weight of the selected fields. Field
//! weights are in row units ([`ROW_UNIT_US`]); unannotated fields count 1.
//!
//! Measured worst cases the model now rejects: `matches(limit: 10000) { players { items } }`
//! (85 CPU-s), `match_history` without an account filter (14-32 CPU-s, a full-table merge) and
//! `matches` ordered by `average_badge` without a time range (24 CPU-s).

use crate::routes::v1::graphql::filters::{I64Filter, MatchHistoryWhere, MatchPlayerWhere};
use crate::routes::v1::graphql::schema::{OrderByMatch, OrderByMatchPlayer};

/// `GraphiQL`'s introspection query reaches 13 levels deep (4 outer + 9 nested
/// `ofType`). 15 leaves headroom while still rejecting pathological user
/// queries — the deepest legitimate user path is `matches → players → field`.
pub(super) const DEPTH_LIMIT: usize = 15;
/// About 10 s of worst-case `ClickHouse` CPU. Every query of the 2026-10-16 traffic fits; the
/// heaviest (~9,300: `match_players(limit: 10000)` over ~1,500 accounts and one hero, with
/// `items { item_id }` and `hero_build`) measured 1.25 CPU-s on average, 4.4 at p99.
pub(super) const COMPLEXITY_LIMIT: usize = 10_000;
/// Hard cap on `limit` regardless of input — mirrors the REST `bulk_metadata` cap.
pub(super) const MAX_LIMIT: u32 = 10_000;

/// CPU of one row unit: a plain `match_player` column, per row, when every row sits in its own
/// granule (account histories). Rows next to each other (a time range) cost ~10x less.
const ROW_UNIT_US: usize = 35;
/// Row units of every `matches` / `match_players` row before its fields: the key columns and
/// the key lookup.
const ROW_BASE_UNITS: usize = 4;

/// Row units of the per-row lookups the nested resolvers batch (1,000 keys per query).
pub(super) const STEAM_LOOKUP_UNITS: usize = 14;
pub(super) const SALTS_LOOKUP_UNITS: usize = 8;
/// Postgres CPU (44 µs per key) plus decoding the ~8 KB of build JSON per row.
pub(super) const HERO_BUILD_LOOKUP_UNITS: usize = 4;

/// The time a patch-scoped query covers: a patch is live for a few weeks.
const PATCH_DAYS: usize = 30;
const SECONDS_PER_DAY: i64 = 86_400;

/// What the `where` / `order_by` of a `matches` or `match_players` query make it scan.
enum Scan {
    /// `account_id` `eq` / `in` on columns `player_match_stats` has: reads those accounts' rows.
    Accounts(usize),
    /// `match_id` `eq` / `in`: reads those matches' granules.
    Matches,
    /// Ordered by `match_id` (the sort key): reads in order and stops at `limit`.
    KeyOrdered,
    /// Sorts every row of the `start_time` range, `None` if unbounded.
    Days(Option<usize>),
}

impl Scan {
    fn of(where_: Option<&MatchPlayerWhere>, key_ordered: bool, scope_days: Option<usize>) -> Self {
        if let Some(accounts) = where_.and_then(MatchPlayerWhere::player_match_stats_accounts) {
            return Self::Accounts(accounts.len());
        }
        if where_
            .and_then(|w| w.match_id.as_ref())
            .is_some_and(|f| f.eq.is_some() || f.r#in.as_ref().is_some_and(|ids| !ids.is_empty()))
        {
            return Self::Matches;
        }
        if key_ordered {
            return Self::KeyOrdered;
        }
        let days = where_
            .and_then(|w| w.start_time.as_ref())
            .and_then(days_spanned);
        Self::Days(days.or(scope_days))
    }

    /// `per_day` / `full`: the cost of sorting one day of rows / the whole table.
    fn ms(&self, base: usize, per_day: usize, full: usize) -> usize {
        match *self {
            Self::Accounts(n) => 100 + n / 20,
            Self::Matches => 20,
            Self::KeyOrdered => 300,
            Self::Days(Some(days)) => (base + per_day * days).min(full),
            Self::Days(None) => full,
        }
    }
}

/// Days of `start_time` a filter keeps, `None` without a lower bound.
fn days_spanned(f: &I64Filter) -> Option<usize> {
    if f.eq.is_some() || f.r#in.as_ref().is_some_and(|v| !v.is_empty()) {
        return Some(1);
    }
    let lower = f.gt.max(f.gte)?;
    let now = chrono::Utc::now().timestamp();
    let upper = f.lt.into_iter().chain(f.lte).fold(now, i64::min);
    usize::try_from((upper - lower).max(0) / SECONDS_PER_DAY + 1).ok()
}

/// Milliseconds of `limit` rows of `row_units` each.
pub(super) fn rows(limit: u32, row_units: usize) -> usize {
    (limit.clamp(1, MAX_LIMIT) as usize)
        .saturating_mul(row_units)
        .saturating_mul(ROW_UNIT_US)
        .div_ceil(1000)
}

fn match_players_scan(scan: &Scan) -> usize {
    scan.ms(200, 25, 5_400)
}

/// The `GROUP BY match_id` of every scanned row costs ~5x the player-row sort.
fn matches_scan(scan: &Scan) -> usize {
    scan.ms(300, 160, 24_000)
}

fn match_players_key_ordered(order_by: Option<OrderByMatchPlayer>) -> bool {
    order_by.is_none_or(|o| o == OrderByMatchPlayer::MatchId)
}

fn matches_key_ordered(order_by: Option<OrderByMatch>) -> bool {
    order_by.is_none_or(|o| o == OrderByMatch::MatchId)
}

pub(super) fn match_players(
    where_: Option<&MatchPlayerWhere>,
    order_by: Option<OrderByMatchPlayer>,
    limit: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(where_, match_players_key_ordered(order_by), None);
    match_players_scan(&scan).saturating_add(rows(limit, ROW_BASE_UNITS + row_units))
}

pub(super) fn patch_match_players(
    where_: Option<&MatchPlayerWhere>,
    order_by: Option<OrderByMatchPlayer>,
    limit: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(
        where_,
        match_players_key_ordered(order_by),
        Some(PATCH_DAYS),
    );
    match_players_scan(&scan).saturating_add(rows(limit, ROW_BASE_UNITS + row_units))
}

pub(super) fn matches(
    where_: Option<&MatchPlayerWhere>,
    order_by: Option<OrderByMatch>,
    limit: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(where_, matches_key_ordered(order_by), None);
    matches_scan(&scan).saturating_add(rows(limit, ROW_BASE_UNITS + row_units))
}

pub(super) fn patch_matches(
    where_: Option<&MatchPlayerWhere>,
    order_by: Option<OrderByMatch>,
    limit: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(where_, matches_key_ordered(order_by), Some(PATCH_DAYS));
    matches_scan(&scan).saturating_add(rows(limit, ROW_BASE_UNITS + row_units))
}

/// `match_history` merges every row of the filtered accounts before it applies `limit`, so its
/// cost is per account: 0.7 ms plus 0.33 ms per selected column. Without an account filter it
/// merges the whole table.
pub(super) fn match_history(where_: Option<&MatchHistoryWhere>, columns: usize) -> usize {
    let accounts = where_.and_then(|w| w.account_id.as_ref()).map_or(0, |f| {
        usize::from(f.eq.is_some()) + f.r#in.as_ref().map_or(0, Vec::len)
    });
    if accounts == 0 {
        return 20_000;
    }
    accounts.saturating_mul(700 + 330 * columns).div_ceil(1000)
}

#[cfg(test)]
mod tests {
    use crate::routes::v1::graphql::schema::build_schema;

    /// The complexity of `query` and whether the limit rejected it. Resolvers fail fast without
    /// an `AppState`, so nothing reaches a database.
    async fn complexity(query: &str) -> (usize, bool) {
        let resp = build_schema().execute(query).await;
        let rejected = resp
            .errors
            .iter()
            .any(|e| e.message.starts_with("Query complexity"));
        let async_graphql::Value::Object(analyzer) = &resp.extensions["analyzer"] else {
            panic!("no analyzer extension: {:?}", resp.errors);
        };
        let async_graphql::Value::Number(n) = &analyzer["complexity"] else {
            panic!("no complexity");
        };
        (usize::try_from(n.as_u64().unwrap()).unwrap(), rejected)
    }

    const ITEMS_ALL: &str = "items { game_time_s item_id upgrade_id sold_time_s flags imbued_ability_id upgrade_info net_worth_at_buy }";

    #[tokio::test]
    async fn heaviest_production_query_fits() {
        // 1.6 CPU-s for the 1,300 rows it found; worst case 10,000 rows.
        let accounts = (1..=1500)
            .map(|i| i.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let (c, rejected) = complexity(&format!(
            "{{ match_players(where: {{account_id: {{in: [{accounts}]}}, start_time: {{gte: 1790950002}}}}, \
             order_by: START_TIME, limit: 10000) {{ match_id account_id hero_id start_time match_mode \
             game_mode hero_build_id items {{ item_id }} }} }}"
        ))
        .await;
        assert!((5_000..10_000).contains(&c), "{c}");
        assert!(!rejected);
    }

    #[tokio::test]
    async fn players_with_items_scale_with_limit() {
        // Measured 85 CPU-s at 10,000 matches and 5.8 CPU-s at 1,000.
        let query = |limit| {
            format!(
                "{{ matches(limit: {limit}) {{ match_id players {{ account_id {ITEMS_ALL} }} }} }}"
            )
        };
        let (big, rejected) = complexity(&query(10_000)).await;
        assert!(rejected, "{big}");
        let (small, rejected) = complexity(&query(1_000)).await;
        assert!(!rejected, "{small}");
        assert!((3_000..10_000).contains(&small), "{small}");
    }

    #[tokio::test]
    async fn match_history_needs_accounts() {
        // Without `account_id` it merges all 510M rows: 14-32 CPU-s.
        let (_, rejected) =
            complexity("{ match_history(limit: 100) { match_id player_kills } }").await;
        assert!(rejected);
        let (c, rejected) = complexity(
            "{ match_history(where: {account_id: {eq: 1}}, limit: 100) { match_id player_kills } }",
        )
        .await;
        assert!(!rejected);
        assert!(c < 20, "{c}");
    }

    #[tokio::test]
    async fn unordered_scans_need_a_time_range() {
        // `average_badge` order over the whole table: 24 CPU-s; over one day: 0.4 CPU-s.
        let (_, rejected) =
            complexity("{ matches(order_by: AVERAGE_BADGE, limit: 100) { match_id } }").await;
        assert!(rejected);
        let (c, rejected) = complexity(
            "{ matches(where: {start_time: {gte: 1790000000, lt: 1790086400}}, order_by: AVERAGE_BADGE, limit: 100) { match_id } }",
        )
        .await;
        assert!(!rejected);
        assert!(c < 1_000, "{c}");
    }

    #[tokio::test]
    async fn key_ordered_queries_stay_cheap() {
        let (c, rejected) = complexity("{ match_players(limit: 100) { match_id kills } }").await;
        assert!(!rejected);
        assert!(c < 1_000, "{c}");
    }
}
