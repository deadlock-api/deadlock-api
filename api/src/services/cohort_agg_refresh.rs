use core::time::Duration;
use std::collections::{HashMap, HashSet};

use clickhouse::Row;
use serde::Deserialize;
use tokio::time::interval;
use tracing::{debug, error, info};

use crate::routes::v1::analytics::item_flow_stats::agg as item_flow_agg;
use crate::routes::v1::analytics::rollup_window::BUILT_THROUGH;
use crate::routes::v1::analytics::{
    game_stats, hero_pair_agg, item_stats, player_performance_curve_agg,
};
use crate::services::lease::Lease;

const REFRESH_INTERVAL_SECS: u64 = 30 * 60;

/// Every API replica runs this loop; the lease lets one of them refresh per interval.
/// Both used to rebuild the same days and truncate each other's staging tables.
const LEASE_KEY: &str = "cohort_agg_refresh:leader";
const LEASE_TTL: Duration = Duration::from_mins(10);
/// The lease outlives the run until shortly before the leader's next tick, so the other
/// replicas skip the rest of this interval.
const LEASE_HOLD_MARGIN: Duration = Duration::from_mins(1);
/// Days the item rollups keep. Covers the whole ranked season, whose start is the site's default
/// window: at 65 days the season outgrew the rollups and those requests fell back to full
/// `match_player` scans. Reads fill in older days from `match_player` (see
/// `rollup_window::Coverage::Incremental`).
pub(crate) const HORIZON_DAYS: u32 = 120;
/// A day is built from the matches ingested at least this long before the build. `created_at`
/// is set when an insert starts, so a slow insert can commit rows older than the newest visible
/// one; once every insert that started before the cap has committed, the rows a build skips
/// all have `created_at` above its [`BUILT_THROUGH`] cap, which is where reads look for them.
const BUILT_THROUGH_LAG: &str = "INTERVAL 5 MINUTE";
const GROUP_BY_SPILL_BYTES: u64 = 8_000_000_000;
const PER_DAY_MAX_MEMORY_BYTES: u64 = 15_032_385_536;

/// Floor on the per-day rebuild threshold, so sparse horizon-edge days still build.
const MIN_NEW_MATCHES: u64 = 10;

/// A day is rebuilt only once new source matches exceed `1/REBUILD_THRESHOLD_DIVISOR`
/// of the day's total (≈2%), floored at [`MIN_NEW_MATCHES`]. Late backfill trickles
/// matches into nearly every historical day every cycle; a flat floor made a 40-day-old,
/// ~57k-match day rebuild ~9x/day to absorb <0.1% churn — full ~30s/6+GiB partition
/// rebuilds that dominated background DB load. Scaling with day size keeps fresh days
/// (huge inflow) rebuilding every cycle while old days rebuild only when late arrivals
/// actually cross ~2%, bounding worst-case staleness to that fraction. At 0.5% the
/// settled days still crossed the line every few hours and accounted for two thirds of
/// this job's CPU; ~50 late matches/hour against a ~48k-match day needs ~2% to settle.
const REBUILD_THRESHOLD_DIVISOR: u64 = 50;

/// New-match count a day must gain since its last build before it is rebuilt.
fn rebuild_threshold(day_matches: u64) -> u64 {
    (day_matches / REBUILD_THRESHOLD_DIVISOR).max(MIN_NEW_MATCHES)
}

/// Persistent record of the source state each agg day partition was last built
/// from: `max(created_at)` and the match count at build time. A day is rebuilt only
/// once its source match count has grown by more than `MIN_NEW_MATCHES`, so we do
/// targeted incremental work and never a blind full-horizon rebuild.
pub(crate) const STATE_TABLE: &str = "default.cohort_agg_refresh_state";

struct CohortSpec {
    table: &'static str,
    staging: &'static str,
    source: Source,
    /// Days checked for new matches every run. Older day partitions are dropped, unless
    /// `history` keeps them.
    horizon_days: u32,
    history: Option<History>,
}

/// Keeps every day from `first_day` on, not just the horizon, and rebuilds any day whose build
/// is older than `rebuild_after_days`, whether or not it gained matches.
///
/// A read takes the matches ingested after a day was built from `match_player`, pruning by the
/// oldest [`BUILT_THROUGH`] of a range of days (see `rollup_window::BuiltDays`). A day that never
/// grows enough to be rebuilt keeps its old build time, and the range it falls into then rereads
/// everything ingested since. Rebuilding every day within a week bounds that to a week of late
/// matches, for one scan of the source per week. Its days are built up to `now() -`
/// [`BUILT_THROUGH_LAG`], not their newest match, so a rebuild moves the bound forward even on
/// a day without new matches.
struct History {
    first_day: &'static str,
    rebuild_after_days: u32,
    /// Bounds the work of a run, e.g. the first ones, which build every day.
    max_days_per_run: usize,
}

enum Source {
    /// Fans each purchase out once per item the buyer owned (`cohort_item_id`).
    Cohort {
        bucket_select: &'static str,
        bucket_col: &'static str,
        extra_array_join: &'static str,
    },
    /// Fans each purchase out once per hero on the opposing team (`enemy_hero_id`).
    EnemyHero,
    /// Sums every stats tick's metrics per time key (`player_performance_curve_agg_v2`).
    PerformanceCurve,
    /// One row per purchase, at the `item_stats_agg_v2` grain.
    ItemStats,
    /// Sums every player row's stats per match-level grain (`game_stats_agg`).
    GameStats,
    /// Sums the stats of every pair of players per match-level grain (`hero_pair_stats_agg`).
    HeroPairs,
    /// One of the item build-flow rollups (`item_flow_*_agg`).
    ItemFlow(item_flow_agg::Kind),
}

// The _v2 tables carry uniqCombined(14) player states (migration 40); the plain uniq states
// of the v1 tables were ~90% of item_stats_cohort_mv's CPU. Pointing the job here builds them
// from scratch while the API keeps reading v1 until they cover the horizon.
fn cohort_specs() -> [CohortSpec; 10] {
    let item_flow = |kind: item_flow_agg::Kind| CohortSpec {
        table: kind.table(),
        staging: kind.staging(),
        source: Source::ItemFlow(kind),
        horizon_days: HORIZON_DAYS,
        history: None,
    };
    [
        // Replaces the `item_stats_agg` refreshable MV, which recomputed all 65 days every hour.
        CohortSpec {
            table: item_stats::ITEM_STATS_AGG_TABLE,
            staging: item_stats::ITEM_STATS_AGG_STAGING,
            source: Source::ItemStats,
            horizon_days: HORIZON_DAYS,
            history: None,
        },
        CohortSpec {
            table: "default.item_cohort_stats_time_agg_v2",
            staging: "default.item_cohort_stats_time_agg_v2_staging",
            source: Source::Cohort {
                bucket_select: "toUInt32(floor(buy_time / 60)) AS bucket_minute",
                bucket_col: "bucket_minute",
                extra_array_join: "",
            },
            horizon_days: HORIZON_DAYS,
            history: None,
        },
        CohortSpec {
            table: "default.item_cohort_stats_net_worth_agg_v2",
            staging: "default.item_cohort_stats_net_worth_agg_v2_staging",
            source: Source::Cohort {
                bucket_select: "toUInt32(floor(net_worth_at_buy / 1000) * 1000) AS bucket_net_worth",
                bucket_col: "bucket_net_worth",
                extra_array_join: ",\n    `upgrades.net_worth_at_buy` AS net_worth_at_buy",
            },
            horizon_days: HORIZON_DAYS,
            history: None,
        },
        CohortSpec {
            table: "default.item_enemy_stats_agg",
            staging: "default.item_enemy_stats_agg_staging",
            source: Source::EnemyHero,
            horizon_days: HORIZON_DAYS,
            history: None,
        },
        // The curve's default window is the season, so it keeps a longer horizon.
        CohortSpec {
            table: player_performance_curve_agg::AGG_TABLE,
            staging: player_performance_curve_agg::AGG_STAGING,
            source: Source::PerformanceCurve,
            horizon_days: player_performance_curve_agg::AGG_HORIZON_DAYS,
            history: None,
        },
        item_flow(item_flow_agg::Kind::Nodes),
        item_flow(item_flow_agg::Kind::Edges),
        item_flow(item_flow_agg::Kind::Totals),
        // Last: their first runs build all of history, up to `max_days_per_run` days each.
        CohortSpec {
            table: game_stats::AGG_TABLE,
            staging: game_stats::AGG_STAGING,
            source: Source::GameStats,
            horizon_days: game_stats::AGG_HORIZON_DAYS,
            history: Some(History {
                first_day: game_stats::AGG_FIRST_DAY,
                rebuild_after_days: 7,
                max_days_per_run: 300,
            }),
        },
        CohortSpec {
            table: hero_pair_agg::AGG_TABLE,
            staging: hero_pair_agg::AGG_STAGING,
            source: Source::HeroPairs,
            horizon_days: hero_pair_agg::AGG_HORIZON_DAYS,
            history: Some(History {
                first_day: hero_pair_agg::AGG_FIRST_DAY,
                rebuild_after_days: 7,
                max_days_per_run: 300,
            }),
        },
    ]
}

/// Measures of every item rollup (`item_stats_agg_v2`, the cohort and enemy rollups), over one
/// purchase's `won`, `buy_time`, `sold_time`, `duration_s` and `account_id`.
pub(crate) const ITEM_ROLLUP_MEASURES: &str = "count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqCombinedState(14)(account_id) AS players_state";

/// The purchase side reads `upgrades.*`, which excludes corrupted purchases (migration 42);
/// the cohort side keeps the raw `items.item_id` so it matches the `hasAll(items.item_id, ...)`
/// presence filter of the base query.
fn select_body(spec: &CohortSpec, since_clause: &str) -> String {
    let (bucket_select, bucket_col, extra_array_join) = match spec.source {
        Source::Cohort {
            bucket_select,
            bucket_col,
            extra_array_join,
        } => (bucket_select, bucket_col, extra_array_join),
        Source::EnemyHero => return enemy_hero_select_body(since_clause, None),
        Source::PerformanceCurve => {
            return player_performance_curve_agg::agg_select_body(since_clause);
        }
        Source::ItemStats => return item_stats::item_stats_agg_select_body(since_clause),
        Source::GameStats => return game_stats::agg_select_body(since_clause),
        Source::HeroPairs => return hero_pair_agg::agg_select_body(since_clause),
        Source::ItemFlow(kind) => return item_flow_agg::agg_select_body(kind, since_clause),
    };
    format!(
        "SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    cohort_item_id,
    item_id,
    {bucket_select},
    {ITEM_ROLLUP_MEASURES}
FROM default.match_player
ARRAY JOIN
    `upgrades.item_id` AS item_id,
    `upgrades.game_time_s` AS buy_time,
    `upgrades.sold_time_s` AS sold_time{extra_array_join}
ARRAY JOIN arrayDistinct(items.item_id) AS cohort_item_id
WHERE match_mode IN ('Ranked', 'Unranked')
    AND {since_clause}
    AND duration_s > 0
GROUP BY game_mode, match_mode, day, cohort_item_id, item_id, {bucket_col}"
    )
}

/// The rows of the cohort rollup `table` for the matches selected by `since_clause`. The
/// item-stats rollup readers aggregate a window's partial days with it.
///
/// # Panics
/// When this job does not build `table` as a cohort rollup.
pub(crate) fn cohort_rollup_rows(table: &str, since_clause: &str) -> String {
    let spec = cohort_specs()
        .into_iter()
        .find(|spec| spec.table == table && matches!(spec.source, Source::Cohort { .. }))
        .unwrap_or_else(|| panic!("{table} is not a cohort rollup"));
    select_body(&spec, since_clause)
}

/// Keep in sync with the backfill in
/// `tools/migrations/clickhouse/41_create_item_enemy_stats_agg.sql`. The opposing-team
/// expression mirrors the semi-join of the `item_stats` base query so both count the same rows.
/// `enemy_hero_id` keeps only the buyers facing that hero.
pub(crate) fn enemy_hero_select_body(since_clause: &str, enemy_hero_id: Option<u32>) -> String {
    let enemy_team_having = enemy_hero_id.map_or_else(String::new, |id| {
        format!("HAVING has(enemy_hero_ids, {id})")
    });
    format!(
        "SELECT
    game_mode,
    match_mode,
    toDate(start_time) AS day,
    enemy_hero_id,
    ifNull(average_badge, 0) AS least_badge,
    ifNull(average_badge, 65535) AS greatest_badge,
    CAST(upgrade_item_id, 'UInt32') AS item_id,
    {ITEM_ROLLUP_MEASURES}
FROM (
    SELECT
        game_mode, match_mode, start_time, average_badge, won, duration_s, account_id,
        `upgrades.item_id` AS item_ids,
        `upgrades.game_time_s` AS buy_times,
        `upgrades.sold_time_s` AS sold_times,
        arrayJoin(enemies.enemy_hero_ids) AS enemy_hero_id
    FROM default.match_player AS buyers
    INNER JOIN (
        SELECT match_id, team AS enemy_team, groupUniqArray(hero_id) AS enemy_hero_ids
        FROM default.match_player
        WHERE match_mode IN ('Ranked', 'Unranked') AND team IN ('Team0', 'Team1')
            AND {since_clause}
        GROUP BY match_id, team
        {enemy_team_having}
    ) AS enemies ON enemies.match_id = buyers.match_id
        AND enemies.enemy_team = if(buyers.team = 'Team0', 'Team1', 'Team0')
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND {since_clause}
        AND duration_s > 0
)
ARRAY JOIN
    item_ids AS upgrade_item_id,
    buy_times AS buy_time,
    sold_times AS sold_time
GROUP BY game_mode, match_mode, day, enemy_hero_id, least_badge, greatest_badge, item_id"
    )
}

/// Restricts a rebuild to a single calendar day, and to the matches ingested up to
/// `built_through`. The day literal must match the `toDate(start_time)` grouping (server
/// timezone) so partition ids line up.
fn day_window_clause(day: &str, built_through: u32) -> String {
    format!(
        "start_time >= toDateTime('{day}') AND start_time < toDateTime('{day}') + INTERVAL 1 DAY \
         AND created_at <= toDateTime({built_through})"
    )
}

/// Source filter mirroring `select_body`'s WHERE; used by the staleness probe so
/// the watermark only advances for rows that actually feed the aggregate.
const SOURCE_FILTER: &str = "match_mode IN ('Ranked', 'Unranked') AND duration_s > 0";

#[derive(Row, Deserialize)]
struct DayRow {
    day: String,
}

#[derive(Row, Deserialize)]
struct WatermarkRow {
    day: String,
    max_created: u32,
    n_matches: u64,
}

async fn distinct_days(
    ch_client: &clickhouse::Client,
    table: &str,
) -> Result<Vec<String>, clickhouse::error::Error> {
    let rows = ch_client
        .query(&format!(
            "SELECT toString(day) AS day FROM {table} GROUP BY day ORDER BY day"
        ))
        .fetch_all::<DayRow>()
        .await?;
    Ok(rows.into_iter().map(|r| r.day).collect())
}

async fn ensure_state_table(
    ch_client: &clickhouse::Client,
) -> Result<(), clickhouse::error::Error> {
    ch_client
        .query(&format!(
            "CREATE TABLE IF NOT EXISTS {STATE_TABLE} (
    table_name String,
    day Date,
    source_max_created_at DateTime,
    source_match_count UInt64 DEFAULT 0,
    refreshed_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(refreshed_at)
ORDER BY (table_name, day)"
        ))
        .execute()
        .await?;
    ch_client
        .query(&format!(
            "ALTER TABLE {STATE_TABLE} ADD COLUMN IF NOT EXISTS source_match_count UInt64 DEFAULT 0"
        ))
        .execute()
        .await
}

/// Per-day build cap (`max(created_at)`, at most [`BUILT_THROUGH_LAG`] ago) and match count in
/// the source over the horizon, newest day first. Cheap:
/// reads only `start_time`/`created_at`/`match_id`, no array joins (~0.2s vs ~30s
/// for a day rebuild).
async fn source_watermarks(
    ch_client: &clickhouse::Client,
    horizon_days: u32,
) -> Result<Vec<WatermarkRow>, clickhouse::error::Error> {
    ch_client
        .query(&format!(
            "SELECT toString(toDate(start_time)) AS day, toUnixTimestamp(least(max(created_at), now() - {BUILT_THROUGH_LAG})) AS max_created, uniqExact(match_id) AS n_matches
FROM default.match_player
WHERE {SOURCE_FILTER}
    AND start_time >= toStartOfDay(now()) - INTERVAL {horizon_days} DAY
GROUP BY day
ORDER BY day DESC"
        ))
        .fetch_all::<WatermarkRow>()
        .await
}

/// Each recorded day's `(built_through, match count)`.
async fn stored_builds(
    ch_client: &clickhouse::Client,
    table: &str,
) -> Result<HashMap<String, (u32, u64)>, clickhouse::error::Error> {
    let rows = ch_client
        .query(&format!(
            "SELECT toString(day) AS day, toUnixTimestamp(source_max_created_at) AS max_created, source_match_count AS n_matches
FROM {STATE_TABLE} FINAL
WHERE table_name = '{table}'"
        ))
        .fetch_all::<WatermarkRow>()
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| (r.day, (r.max_created, r.n_matches)))
        .collect())
}

async fn record_watermark(
    ch_client: &clickhouse::Client,
    table: &str,
    day: &str,
    built_through: u32,
    n_matches: u64,
) -> Result<(), clickhouse::error::Error> {
    ch_client
        .query(&format!(
            "INSERT INTO {STATE_TABLE} (table_name, day, source_max_created_at, source_match_count, refreshed_at) \
             VALUES ('{table}', '{day}', toDateTime({built_through}), {n_matches}, now())"
        ))
        .execute()
        .await
}

/// Rebuilds `day` from the matches ingested up to `built_through`, which every row of the
/// partition records in [`BUILT_THROUGH`] (the last column of every table this job builds).
async fn rebuild_day(
    ch_client: &clickhouse::Client,
    spec: &CohortSpec,
    day: &str,
    built_through: u32,
    log_comment: &str,
) -> Result<(), clickhouse::error::Error> {
    ch_client
        .query(&format!("TRUNCATE TABLE {}", spec.staging))
        .execute()
        .await?;
    let body = select_body(spec, &day_window_clause(day, built_through));
    let insert = format!(
        "INSERT INTO {staging} SELECT *, toDateTime({built_through}) AS {BUILT_THROUGH} FROM ({body}) SETTINGS max_bytes_before_external_group_by = \
         {GROUP_BY_SPILL_BYTES}, max_threads = 8, max_memory_usage = {PER_DAY_MAX_MEMORY_BYTES}, \
         log_comment = '{log_comment}'",
        staging = spec.staging,
    );
    ch_client.query(&insert).execute().await?;
    for staged_day in distinct_days(ch_client, spec.staging).await? {
        ch_client
            .query(&format!(
                "ALTER TABLE {table} REPLACE PARTITION '{staged_day}' FROM {staging}",
                table = spec.table,
                staging = spec.staging,
            ))
            .execute()
            .await?;
    }
    Ok(())
}

#[derive(Row, Deserialize)]
struct CapRow {
    cap: u32,
}

/// The days a [`History`] spec rebuilds this run, as `(day, built_through, match count)`. See
/// [`history_due`].
async fn history_rebuilds(
    ch_client: &clickhouse::Client,
    history: &History,
    source: &[WatermarkRow],
    grown: Vec<(String, u32, u64)>,
    stored: &HashMap<String, (u32, u64)>,
) -> Result<Vec<(String, u32, u64)>, clickhouse::error::Error> {
    let first_day = history.first_day;
    let days = ch_client
        .query(&format!(
            "SELECT toString(toDate('{first_day}') + number) AS day \
             FROM numbers(toUInt64(dateDiff('day', toDate('{first_day}'), today()) + 1))"
        ))
        .fetch_all::<DayRow>()
        .await?;
    let cap = ch_client
        .query(&format!(
            "SELECT toUnixTimestamp(now() - {BUILT_THROUGH_LAG}) AS cap"
        ))
        .fetch_one::<CapRow>()
        .await?
        .cap;
    let days = days.into_iter().map(|row| row.day).collect::<Vec<_>>();
    Ok(history_due(history, &days, cap, source, grown, stored))
}

/// The `grown` days of the horizon, then, up to `max_days_per_run`, the `days` (oldest first)
/// never built, newest first so the built days stay one run, and those built before `cap` minus
/// `rebuild_after_days`, oldest build first. All of them are built up to `cap`.
fn history_due(
    history: &History,
    days: &[String],
    cap: u32,
    source: &[WatermarkRow],
    grown: Vec<(String, u32, u64)>,
    stored: &HashMap<String, (u32, u64)>,
) -> Vec<(String, u32, u64)> {
    let aged_before = cap.saturating_sub(history.rebuild_after_days * 86_400);
    let grown_days: HashSet<&str> = grown.iter().map(|(day, ..)| day.as_str()).collect();
    let mut missing = vec![];
    let mut aged = vec![];
    for day in days.iter().rev() {
        if grown_days.contains(day.as_str()) {
            continue;
        }
        match stored.get(day) {
            None => missing.push(day),
            Some(&(built_through, _)) if built_through < aged_before => {
                aged.push((built_through, day));
            }
            Some(_) => {}
        }
    }
    aged.sort_unstable();
    // Days past the horizon have no fresh count; they keep their recorded one, which no growth
    // check reads again.
    let n_matches = |day: &str| {
        source
            .iter()
            .find(|row| row.day == day)
            .map(|row| row.n_matches)
            .or_else(|| stored.get(day).map(|&(_, n_matches)| n_matches))
            .unwrap_or(0)
    };
    let due = missing
        .into_iter()
        .chain(aged.into_iter().map(|(_, day)| day))
        .take(history.max_days_per_run)
        .map(|day| (day.clone(), n_matches(day)));
    grown
        .into_iter()
        .map(|(day, _, n_matches)| (day, n_matches))
        .chain(due)
        .map(|(day, n_matches)| (day, cap, n_matches))
        .collect()
}

/// Rebuilds only the day partitions whose source watermark advanced since the
/// last run (and, for a [`History`] spec, the days due by age), then prunes agg days that fell
/// out of the horizon unless the spec keeps its history. On a cold start
/// (no recorded state) every source day is "stale", so this also serves as the
/// initial full build — without ever scanning the full horizon when warm.
async fn refresh(
    ch_client: &clickhouse::Client,
    spec: &CohortSpec,
) -> Result<(), clickhouse::error::Error> {
    let log_comment = format!("{}_refresh", spec.table);
    let source = source_watermarks(ch_client, spec.horizon_days).await?;
    let stored = stored_builds(ch_client, spec.table).await?;
    // A day only counts as built while its partition exists: the state outlives the partitions
    // dropped past the horizon, so a day that re-enters a grown horizon would never be rebuilt.
    let built_days = distinct_days(ch_client, spec.table).await?;
    let built: HashSet<&str> = built_days.iter().map(String::as_str).collect();

    let stale: Vec<(String, u32, u64)> = source
        .iter()
        .filter(|row| {
            let prev = if built.contains(row.day.as_str()) {
                stored.get(&row.day).map_or(0, |&(_, n_matches)| n_matches)
            } else {
                0
            };
            row.n_matches > prev + rebuild_threshold(row.n_matches)
        })
        .map(|row| (row.day.clone(), row.max_created, row.n_matches))
        .collect();
    let stale = match &spec.history {
        Some(history) => history_rebuilds(ch_client, history, &source, stale, &stored).await?,
        None => stale,
    };
    // Newest first: recent days are read the most, and fill in from `match_player` until built.
    // Each day is recorded as soon as it is built, so a pass cut short (an error, a deploy) keeps
    // its progress instead of rebuilding every day again.
    for (day, built_through, n_matches) in &stale {
        rebuild_day(ch_client, spec, day, *built_through, &log_comment).await?;
        record_watermark(ch_client, spec.table, day, *built_through, *n_matches).await?;
    }

    let dropped = if spec.history.is_some() {
        0
    } else if let Some(oldest_fresh) = source.iter().map(|r| &r.day).min() {
        let stale_partitions: Vec<&String> = built_days
            .iter()
            .filter(|d| d.as_str() < oldest_fresh.as_str())
            .collect();
        for day in &stale_partitions {
            ch_client
                .query(&format!(
                    "ALTER TABLE {table} DROP PARTITION '{day}'",
                    table = spec.table,
                ))
                .execute()
                .await?;
        }
        stale_partitions.len()
    } else {
        0
    };
    info!(
        "cohort agg refresh for {} rebuilt {} day(s), dropped {dropped} stale",
        spec.table,
        stale.len()
    );
    Ok(())
}

pub(crate) fn spawn_cohort_agg_refresh(
    ch_client: clickhouse::Client,
    redis: redis::aio::MultiplexedConnection,
) {
    // Each per-day insert sets its own log_comment, overriding this one.
    let ch_client = ch_client
        .with_setting("max_execution_time", "600")
        .with_setting("log_comment", "cohort_agg_refresh");
    tokio::spawn(async move {
        let specs = cohort_specs();
        info!(
            "cohort agg refresh started: watermark-driven, every {REFRESH_INTERVAL_SECS}s rebuild \
             only days changed since last run (horizon {HORIZON_DAYS}d)"
        );
        if let Err(e) = ensure_state_table(&ch_client).await {
            error!("cohort agg state table init failed: {e}");
        }
        let token = uuid::Uuid::new_v4().simple().to_string();
        let mut tick = interval(Duration::from_secs(REFRESH_INTERVAL_SECS));
        loop {
            tick.tick().await;
            let started = std::time::Instant::now();
            let lease = match Lease::acquire(redis.clone(), LEASE_KEY, &token, LEASE_TTL).await {
                Ok(Some(lease)) => lease,
                Ok(None) => {
                    debug!("cohort agg refresh: another replica holds the lease; skipping tick");
                    continue;
                }
                Err(e) => {
                    error!("cohort agg refresh: lease acquisition failed: {e}");
                    continue;
                }
            };
            for spec in &specs {
                if let Err(e) = refresh(&ch_client, spec).await {
                    error!("cohort agg refresh for {} failed: {e}", spec.table);
                }
            }
            let hold = Duration::from_secs(REFRESH_INTERVAL_SECS)
                .saturating_sub(started.elapsed())
                .saturating_sub(LEASE_HOLD_MARGIN);
            lease.hold_for(hold).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: u32 = 86_400;

    fn days(names: &[&str]) -> Vec<String> {
        names.iter().map(|&d| d.to_owned()).collect()
    }

    #[test]
    fn history_rebuilds_grown_then_missing_then_oldest_builds() {
        let history = History {
            first_day: "2026-01-01",
            rebuild_after_days: 7,
            max_days_per_run: 3,
        };
        let cap = 100 * DAY;
        let all = days(&["d1", "d2", "d3", "d4", "d5", "d6"]);
        let source = vec![WatermarkRow {
            day: "d6".to_owned(),
            max_created: 99 * DAY,
            n_matches: 60,
        }];
        let grown = vec![("d6".to_owned(), 99 * DAY, 60)];
        let stored = HashMap::from([
            ("d1".to_owned(), (80 * DAY, 10)),
            ("d2".to_owned(), (85 * DAY, 20)),
            ("d4".to_owned(), (95 * DAY, 40)),
            ("d6".to_owned(), (98 * DAY, 50)),
        ]);
        let due = history_due(&history, &all, cap, &source, grown, &stored);
        assert_eq!(
            due,
            vec![
                // Grown, built up to the cap rather than its newest match.
                ("d6".to_owned(), cap, 60),
                // Never built, newest first.
                ("d5".to_owned(), cap, 0),
                ("d3".to_owned(), cap, 0),
                // Built over a week ago, oldest first, up to `max_days_per_run`: d2 waits.
                ("d1".to_owned(), cap, 10),
            ]
        );
    }
}
