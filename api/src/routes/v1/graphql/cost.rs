//! Cost model behind the schema's complexity limit.
//!
//! One complexity point is about 1 ms of `ClickHouse` CPU in the worst case the arguments allow,
//! calibrated against production on 2026-10-16. A list query costs what its `where` / `order_by`
//! make it scan ([`Scan`]) plus `limit` times the per-row weight of the selected fields. Field
//! weights are in row units ([`ROW_UNIT_US`]); unannotated fields count 1.
//!
//! Checked against 5,800 production requests on 2026-10-17 (predicted vs `system.query_log` CPU,
//! joined on `request_logs.graphql_request_id`): no request above 1.6x its complexity.
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

/// CPU of one row unit: a plain `match_player` column, per row, for the rows of a few weeks of
/// matches. Rows next to each other (a time range) cost less.
const ROW_UNIT_US: usize = 35;
/// Rows spread over whole account histories each sit in their own granule: measured 2.6-3.6x the
/// row units of a recent window (2026-10-17, `stats` / `items` / plain columns of single accounts).
const SPARSE_ROW_FACTOR: usize = 3;
/// A `start_time` window of an account scan longer than this reads sparse rows.
const DENSE_DAYS: usize = 30;
/// Player rows of one match.
const PLAYERS_PER_MATCH: usize = 12;
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
    /// `account_id` `eq` / `in` on columns `player_match_stats` has: reads those accounts' rows,
    /// `sparse` without a `start_time` window of at most [`DENSE_DAYS`].
    Accounts { accounts: usize, sparse: bool },
    /// `match_id` `eq` / `in`: reads those matches' granules.
    Matches(usize),
    /// Ordered by `match_id` (the sort key): reads in order and stops at `limit`.
    KeyOrdered,
    /// Sorts every row of the `start_time` range, `None` if unbounded.
    Days(Option<usize>),
}

impl Scan {
    fn of(where_: Option<&MatchPlayerWhere>, key_ordered: bool, scope_days: Option<usize>) -> Self {
        let days = where_
            .and_then(|w| w.start_time.as_ref())
            .and_then(days_spanned)
            .or(scope_days);
        if let Some(accounts) = where_.and_then(MatchPlayerWhere::player_match_stats_accounts) {
            return Self::Accounts {
                accounts: accounts.len(),
                sparse: days.is_none_or(|d| d > DENSE_DAYS),
            };
        }
        let matches = where_.and_then(|w| w.match_id.as_ref()).map_or(0, |f| {
            usize::from(f.eq.is_some()) + f.r#in.as_ref().map_or(0, Vec::len)
        });
        if matches > 0 {
            return Self::Matches(matches);
        }
        if key_ordered {
            return Self::KeyOrdered;
        }
        Self::Days(days)
    }

    /// `per_day` / `full`: the cost of sorting one day of rows / the whole table.
    fn ms(&self, costs: ScanCosts) -> usize {
        let ScanCosts {
            pinned,
            key_ordered,
            base,
            per_day,
            full,
        } = costs;
        match *self {
            Self::Accounts { accounts, .. } => 100 + accounts / 20,
            Self::Matches(_) => pinned,
            Self::KeyOrdered => key_ordered,
            Self::Days(Some(days)) => (base + per_day * days).min(full),
            Self::Days(None) => full,
        }
    }

    /// Milliseconds of the up to `limit` rows of `row_units` each it returns; a pinned match has
    /// `rows_per_match` rows.
    fn rows(&self, limit: u32, row_units: usize, rows_per_match: usize) -> usize {
        match *self {
            Self::Accounts { sparse: true, .. } => {
                rows(limit, row_units.saturating_mul(SPARSE_ROW_FACTOR))
            }
            Self::Matches(n) => {
                let pinned = u32::try_from(n.saturating_mul(rows_per_match)).unwrap_or(u32::MAX);
                rows(limit.min(pinned), row_units)
            }
            _ => rows(limit, row_units),
        }
    }
}

/// Milliseconds of each [`Scan`] of one query shape.
#[derive(Clone, Copy)]
struct ScanCosts {
    pinned: usize,
    key_ordered: usize,
    base: usize,
    per_day: usize,
    full: usize,
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
    scan.ms(ScanCosts {
        pinned: 20,
        key_ordered: 300,
        base: 200,
        per_day: 25,
        full: 5_400,
    })
}

/// Two passes over `match_player` (pick the matches, then aggregate their players); unordered,
/// the `GROUP BY match_id` of every scanned row costs ~5x the player-row sort.
fn matches_scan(scan: &Scan) -> usize {
    scan.ms(ScanCosts {
        pinned: 40,
        key_ordered: 600,
        base: 300,
        per_day: 160,
        full: 24_000,
    })
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
    match_players_scan(&scan).saturating_add(scan.rows(
        limit,
        ROW_BASE_UNITS + row_units,
        PLAYERS_PER_MATCH,
    ))
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
    match_players_scan(&scan).saturating_add(scan.rows(
        limit,
        ROW_BASE_UNITS + row_units,
        PLAYERS_PER_MATCH,
    ))
}

pub(super) fn matches(
    where_: Option<&MatchPlayerWhere>,
    order_by: Option<OrderByMatch>,
    limit: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(where_, matches_key_ordered(order_by), None);
    matches_scan(&scan).saturating_add(scan.rows(limit, ROW_BASE_UNITS + row_units, 1))
}

pub(super) fn patch_matches(
    where_: Option<&MatchPlayerWhere>,
    order_by: Option<OrderByMatch>,
    limit: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(where_, matches_key_ordered(order_by), Some(PATCH_DAYS));
    matches_scan(&scan).saturating_add(scan.rows(limit, ROW_BASE_UNITS + row_units, 1))
}

/// `match_history` merges every row of the filtered accounts before it applies `limit`, so its
/// cost is per account: 3.5 ms plus 1.65 ms per selected column, after 20 ms to plan and start
/// the query (2026-10-17: 1-6 accounts of ~22 columns took up to 80-180 ms). Without an account
/// filter it merges the whole table.
pub(super) fn match_history(where_: Option<&MatchHistoryWhere>, columns: usize) -> usize {
    let accounts = where_.and_then(|w| w.account_id.as_ref()).map_or(0, |f| {
        usize::from(f.eq.is_some()) + f.r#in.as_ref().map_or(0, Vec::len)
    });
    if accounts == 0 {
        return 20_000;
    }
    20 + accounts
        .saturating_mul(3_500 + 1_650 * columns)
        .div_ceil(1000)
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
        assert!(c < 100, "{c}");
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
    async fn account_history_rows_are_sparse() {
        // One account's last 60 matches with `stats`: 1.1-2.0 CPU-s measured (2026-10-17).
        let query = |window: &str| {
            format!(
                "{{ match_players(where: {{account_id: {{eq: 1}}{window}}}, order_by: START_TIME, limit: 60) \
                 {{ match_id kills items {{ item_id game_time_s }} stats {{ time_stamp_s gold_player \
                 creep_kills custom_user_stats }} }} }}"
            )
        };
        let (history, _) = complexity(&query("")).await;
        let start = chrono::Utc::now().timestamp() - 7 * 86_400;
        let (recent, _) = complexity(&query(&format!(", start_time: {{gte: {start}}}"))).await;
        assert!((1_000..3_000).contains(&history), "{history}");
        assert!(recent * 2 < history, "{recent} vs {history}");
    }

    #[tokio::test]
    async fn pinned_matches_cap_rows() {
        // `limit` can't return more than 12 rows per pinned match.
        let (c, _) = complexity(
            "{ match_players(where: {match_id: {in: [1, 2]}}, limit: 10000) { match_id kills } }",
        )
        .await;
        assert!(c < 50, "{c}");
    }

    #[tokio::test]
    async fn key_ordered_queries_stay_cheap() {
        let (c, rejected) = complexity("{ match_players(limit: 100) { match_id kills } }").await;
        assert!(!rejected);
        assert!(c < 1_000, "{c}");
    }
}
