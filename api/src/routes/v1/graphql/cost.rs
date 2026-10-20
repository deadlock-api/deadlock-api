//! Cost model behind the schema's complexity limit.
//!
//! One complexity point is about 1 ms of `ClickHouse` CPU in the worst case the arguments allow,
//! calibrated against production on 2026-10-16. A list query costs what its `where` / `order_by`
//! make it scan ([`Scan`]), including the `offset` rows it reads past, plus `limit` times the
//! per-row weight of the selected fields. Field weights are in row units ([`ROW_UNIT_US`]);
//! unannotated fields count 1.
//!
//! Checked against production requests (predicted vs `system.query_log` CPU, joined on
//! `request_logs.graphql_request_id`): 5,800 on 2026-10-17 and 10,000 on 2026-10-18, none above
//! 2x its complexity.
//!
//! Measured worst cases the model now rejects: `matches(limit: 10000) { players { items } }`
//! (85 CPU-s), `match_history` without an account filter (14-32 CPU-s, a full-table merge) and
//! `matches` ordered by `average_badge` without a time range (24 CPU-s), and `matches` in
//! `match_id` order skipping 20M matches (10 CPU-s, priced 601 before `offset` counted).

use crate::routes::v1::graphql::filters::{I64Filter, MatchHistoryWhere, MatchPlayerWhere};
use crate::routes::v1::graphql::salts::MatchSaltsWhere;
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
    fn of(where_: Option<&MatchPlayerWhere>, key_ordered: bool) -> Self {
        let days = where_
            .and_then(|w| w.start_time.as_ref())
            .and_then(days_spanned);
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

    /// `per_day` / `full`: the cost of sorting one day of rows / the whole table. `offset` adds
    /// the nodes the scan reads or sorts past; pinned matches and account rows bound it.
    fn ms(&self, costs: ScanCosts, offset: u32) -> usize {
        let ScanCosts {
            pinned,
            key_ordered,
            base,
            per_day,
            full,
            skip_ns,
            sorted_skip_ns,
        } = costs;
        match *self {
            Self::Accounts { accounts, .. } => 100 + accounts / 20,
            Self::Matches(_) => pinned,
            Self::KeyOrdered => key_ordered.saturating_add(skipped(offset, skip_ns)),
            Self::Days(Some(days)) => (base + per_day * days)
                .min(full)
                .saturating_add(skipped(offset, sorted_skip_ns)),
            Self::Days(None) => full.saturating_add(skipped(offset, sorted_skip_ns)),
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
    /// CPU per node `offset` skips in a key-ordered read / a sort.
    skip_ns: usize,
    sorted_skip_ns: usize,
}

/// Milliseconds of `offset` skipped nodes of `ns` each.
fn skipped(offset: u32, ns: usize) -> usize {
    (offset as usize).saturating_mul(ns).div_ceil(1_000_000)
}

/// Days of `start_time` a filter keeps, `None` without a lower bound.
fn days_spanned(f: &I64Filter) -> Option<usize> {
    if f.eq.is_some() || f.r#in.as_ref().is_some_and(|v| !v.is_empty()) {
        return Some(1);
    }
    let lower = f.gt.max(f.gte)?;
    let now = chrono::Utc::now().timestamp();
    let upper = f.lt.into_iter().chain(f.lte).fold(now, i64::min);
    usize::try_from(upper.saturating_sub(lower).max(0) / SECONDS_PER_DAY + 1).ok()
}

/// Milliseconds of `limit` rows of `row_units` each.
pub(super) fn rows(limit: u32, row_units: usize) -> usize {
    (limit.clamp(1, MAX_LIMIT) as usize)
        .saturating_mul(row_units)
        .saturating_mul(ROW_UNIT_US)
        .div_ceil(1000)
}

/// A skipped player row reads only the key and filter columns (lazy materialization covers every
/// `limit` up to [`MAX_LIMIT`]): 0.63 / 1.5-2.0 / 7.2 CPU-s at offset 1M / 10M / 60M in `match_id`
/// order. Sorting past them over 7 days of `start_time` took 1.1 / 1.5 / 2.0 CPU-s at offset 1M /
/// 5M / 30M, 0.4 at 0 (2026-10-19).
fn match_players_scan(scan: &Scan, offset: u32) -> usize {
    scan.ms(
        ScanCosts {
            pinned: 20,
            key_ordered: 300,
            base: 200,
            per_day: 25,
            full: 5_400,
            skip_ns: 150,
            sorted_skip_ns: 150,
        },
        offset,
    )
}

/// Two passes over `match_player` (pick the matches, then aggregate their players); a pinned
/// match opens every selected column of its part (one match with heavy players: 97 ms median,
/// 323 max, 2026-10-18); unordered,
/// the `GROUP BY match_id` of every scanned row costs ~5x the player-row sort. A skipped match
/// in `match_id` order reads its 12 player rows and the threads read ahead of them: 2.0 / 5.2 /
/// 10.3 CPU-s at offset 1M / 5M / 20M (2026-10-19). The `GROUP BY` already aggregates every row of
/// an unordered scan, so skipping its groups is free (7 days: 1.8 CPU-s at offset 0 and 1M).
fn matches_scan(scan: &Scan, offset: u32) -> usize {
    scan.ms(
        ScanCosts {
            pinned: 120,
            key_ordered: 600,
            base: 300,
            per_day: 160,
            full: 24_000,
            skip_ns: 1_000,
            sorted_skip_ns: 0,
        },
        offset,
    )
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
    offset: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(where_, match_players_key_ordered(order_by));
    match_players_scan(&scan, offset).saturating_add(scan.rows(
        limit,
        ROW_BASE_UNITS + row_units,
        PLAYERS_PER_MATCH,
    ))
}

pub(super) fn matches(
    where_: Option<&MatchPlayerWhere>,
    order_by: Option<OrderByMatch>,
    limit: u32,
    offset: u32,
    row_units: usize,
) -> usize {
    let scan = Scan::of(where_, matches_key_ordered(order_by));
    matches_scan(&scan, offset).saturating_add(scan.rows(limit, ROW_BASE_UNITS + row_units, 1))
}

/// `match_history` merges every row of the filtered accounts before it applies `limit`, so its
/// cost is per account: 3.5 ms plus 1.65 ms per selected column, after 20 ms to plan and start
/// the query (2026-10-17: 1-6 accounts of ~22 columns took up to 80-180 ms), plus ~20 µs per
/// returned row (2026-10-18: 3,000-row pages took 120 ms). Without an account filter it merges
/// the whole table.
pub(super) fn match_history(
    where_: Option<&MatchHistoryWhere>,
    limit: u32,
    columns: usize,
) -> usize {
    let accounts = where_.and_then(|w| w.account_id.as_ref()).map_or(0, |f| {
        usize::from(f.eq.is_some()) + f.r#in.as_ref().map_or(0, Vec::len)
    });
    if accounts == 0 {
        return 20_000;
    }
    20 + accounts
        .saturating_mul(3_500 + 1_650 * columns)
        .div_ceil(1000)
        + rows(limit, 1)
}

/// `match_salts` (29M rows, unpartitioned) pages in `match_id` order until it has `limit` matches
/// with salts, so a sparse range scans up to the whole table: ~0.5 CPU-s measured (2026-10-18).
/// Pinned `match_id`s cost ~0.2 ms each to select and up to ~2.5 ms per returned row, whose
/// `FINAL` merges a granule of its own when the ids are spread (1 / 10 / 100 / 3,364 spread ids:
/// 14 / 59 / 246 / 2,157 ms).
pub(super) fn match_salts(where_: Option<&MatchSaltsWhere>, limit: u32, row_units: usize) -> usize {
    let ids = where_.and_then(|w| w.match_id.as_ref()).map_or(0, |f| {
        usize::from(f.eq.is_some()) + f.r#in.as_ref().map_or(0, Vec::len)
    });
    if ids == 0 {
        return 500 + rows(limit, SALTS_LOOKUP_UNITS + row_units);
    }
    let returned = limit.min(u32::try_from(ids).unwrap_or(u32::MAX));
    let merges = (returned as usize).saturating_mul(5).div_ceil(2);
    (20 + ids / 5)
        .saturating_add(merges)
        .saturating_add(rows(returned, SALTS_LOOKUP_UNITS + row_units))
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

        // A lower bound far in the past must not wrap the span into one day.
        let (_, rejected) = complexity(
            "{ matches(where: {start_time: {gte: -9223372036854775808}}, order_by: AVERAGE_BADGE, limit: 100) { match_id } }",
        )
        .await;
        assert!(rejected);
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
    async fn match_salts_ranges_pay_for_their_scan() {
        // A sparse `match_id` range read 5.9M rows for 30 salts (0.5 CPU-s, 2026-10-18).
        let (range, _) = complexity(
            "{ match_salts(where: {match_id: {gte: 60000000}}, limit: 30) { match_id demo_url } }",
        )
        .await;
        assert!((500..1_000).contains(&range), "{range}");
        // 3,364 pinned ids, default limit 100: 0.4-0.6 CPU-s.
        let ids = (1..=3364)
            .map(|i| i.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let (pinned, rejected) = complexity(&format!(
            "{{ match_salts(where: {{match_id: {{in: [{ids}]}}}}) {{ match_id demo_url }} }}"
        ))
        .await;
        assert!(!rejected);
        assert!((600..1_500).contains(&pinned), "{pinned}");
    }

    #[tokio::test]
    async fn key_ordered_queries_stay_cheap() {
        let (c, rejected) = complexity("{ match_players(limit: 100) { match_id kills } }").await;
        assert!(!rejected);
        assert!(c < 1_000, "{c}");
    }

    #[tokio::test]
    async fn offsets_pay_for_skipped_rows() {
        // `match_id` order, limit 1: 0.1 / 2.0 / 5.2 / 10.3 CPU-s at offset 0 / 1M / 5M / 20M.
        let matches = |offset| {
            format!("{{ matches(order_by: MATCH_ID, limit: 1, offset: {offset}) {{ match_id }} }}")
        };
        let (c, _) = complexity(&matches(0)).await;
        assert!(c < 1_000, "{c}");
        let (c, _) = complexity(&matches(1_000_000)).await;
        assert!((1_000..4_000).contains(&c), "{c}");
        let (c, rejected) = complexity(&matches(5_000_000)).await;
        assert!(!rejected, "{c}");
        let (_, rejected) = complexity(&matches(30_000_000)).await;
        assert!(rejected);

        // 1.5-2.0 CPU-s at offset 10M.
        let (c, _) = complexity(
            "{ match_players(limit: 1, offset: 10000000) { match_id account_id kills } }",
        )
        .await;
        assert!((1_000..4_000).contains(&c), "{c}");

        // An account scan sorts all of the accounts' rows whatever the offset.
        let account = |offset| {
            format!(
                "{{ match_players(where: {{account_id: {{eq: 1}}}}, order_by: START_TIME, limit: 10, \
                 offset: {offset}) {{ match_id }} }}"
            )
        };
        assert_eq!(
            complexity(&account(0)).await.0,
            complexity(&account(1_000_000)).await.0
        );
    }
}
