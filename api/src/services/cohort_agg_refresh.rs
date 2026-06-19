use core::time::Duration;
use std::collections::HashMap;

use clickhouse::Row;
use serde::Deserialize;
use tokio::time::interval;
use tracing::{error, info};

const REFRESH_INTERVAL_SECS: u64 = 30 * 60;
const HORIZON_DAYS: u32 = 65;
const GROUP_BY_SPILL_BYTES: u64 = 8_000_000_000;
const PER_DAY_MAX_MEMORY_BYTES: u64 = 15_032_385_536;

/// A day is rebuilt only once at least this many *new* source matches have landed
/// in it since the last build. Late backfill trickles a handful of old matches into
/// nearly every historical day every cycle; without this gate each such day gets a
/// full ~30-60s rebuild to absorb a few rows. Changes accumulate until they cross
/// this bar.
const MIN_NEW_MATCHES: u64 = 10;

/// Persistent record of the source state each agg day partition was last built
/// from: `max(created_at)` and the match count at build time. A day is rebuilt only
/// once its source match count has grown by more than `MIN_NEW_MATCHES`, so we do
/// targeted incremental work and never a blind 65-day full rebuild.
const STATE_TABLE: &str = "default.cohort_agg_refresh_state";

struct CohortSpec {
    table: &'static str,
    staging: &'static str,
    bucket_select: &'static str,
    bucket_col: &'static str,
    extra_array_join: &'static str,
}

fn cohort_specs() -> [CohortSpec; 2] {
    [
        CohortSpec {
            table: "default.item_cohort_stats_time_agg",
            staging: "default.item_cohort_stats_time_agg_staging",
            bucket_select: "toUInt32(floor(buy_time / 60)) AS bucket_minute",
            bucket_col: "bucket_minute",
            extra_array_join: "",
        },
        CohortSpec {
            table: "default.item_cohort_stats_net_worth_agg",
            staging: "default.item_cohort_stats_net_worth_agg_staging",
            bucket_select: "toUInt32(floor(net_worth_at_buy / 1000) * 1000) AS bucket_net_worth",
            bucket_col: "bucket_net_worth",
            extra_array_join: ",\n    `upgrades.net_worth_at_buy` AS net_worth_at_buy",
        },
    ]
}

fn select_body(spec: &CohortSpec, since_clause: &str) -> String {
    format!(
        "SELECT
    game_mode,
    toDate(start_time) AS day,
    cohort_item_id,
    item_id,
    {bucket_select},
    count() AS n_matches,
    sum(won) AS n_wins,
    sum(buy_time) AS sum_buy_time,
    sum((buy_time / duration_s) * 100) AS sum_buy_rel,
    sum(if(sold_time > 0, sold_time, 0)) AS sum_sold_time,
    sum(toUInt64(sold_time > 0)) AS n_sold,
    sum(if(sold_time > 0, (sold_time / duration_s) * 100, 0)) AS sum_sold_rel,
    uniqState(account_id) AS players_state
FROM default.match_player
ARRAY JOIN
    `upgrades.item_id` AS item_id,
    `upgrades.game_time_s` AS buy_time,
    `upgrades.sold_time_s` AS sold_time{extra_array_join}
ARRAY JOIN arrayDistinct(items.item_id) AS cohort_item_id
WHERE match_mode IN ('Ranked', 'Unranked')
    AND {since_clause}
    AND duration_s > 0
GROUP BY game_mode, day, cohort_item_id, item_id, {bucket_col}",
        bucket_select = spec.bucket_select,
        extra_array_join = spec.extra_array_join,
        bucket_col = spec.bucket_col,
    )
}

/// Restricts a rebuild to a single calendar day. The literal must match the
/// `toDate(start_time)` grouping (server timezone) so partition ids line up.
fn day_window_clause(day: &str) -> String {
    format!(
        "start_time >= toDateTime('{day}') AND start_time < toDateTime('{day}') + INTERVAL 1 DAY"
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

/// Per-day `max(created_at)` and match count in the source over the horizon. Cheap:
/// reads only `start_time`/`created_at`/`match_id`, no array joins (~0.2s vs ~30s
/// for a day rebuild).
async fn source_watermarks(
    ch_client: &clickhouse::Client,
) -> Result<Vec<WatermarkRow>, clickhouse::error::Error> {
    ch_client
        .query(&format!(
            "SELECT toString(toDate(start_time)) AS day, toUnixTimestamp(max(created_at)) AS max_created, uniqExact(match_id) AS n_matches
FROM default.match_player
WHERE {SOURCE_FILTER}
    AND start_time >= toStartOfDay(now()) - INTERVAL {HORIZON_DAYS} DAY
GROUP BY day"
        ))
        .fetch_all::<WatermarkRow>()
        .await
}

async fn stored_match_counts(
    ch_client: &clickhouse::Client,
    table: &str,
) -> Result<HashMap<String, u64>, clickhouse::error::Error> {
    let rows = ch_client
        .query(&format!(
            "SELECT toString(day) AS day, toUnixTimestamp(source_max_created_at) AS max_created, source_match_count AS n_matches
FROM {STATE_TABLE} FINAL
WHERE table_name = '{table}'"
        ))
        .fetch_all::<WatermarkRow>()
        .await?;
    Ok(rows.into_iter().map(|r| (r.day, r.n_matches)).collect())
}

async fn record_watermarks(
    ch_client: &clickhouse::Client,
    table: &str,
    days: &[(String, u32, u64)],
) -> Result<(), clickhouse::error::Error> {
    if days.is_empty() {
        return Ok(());
    }
    let values = days
        .iter()
        .map(|(day, ts, n)| format!("('{table}', '{day}', toDateTime({ts}), {n}, now())"))
        .collect::<Vec<_>>()
        .join(", ");
    ch_client
        .query(&format!(
            "INSERT INTO {STATE_TABLE} (table_name, day, source_max_created_at, source_match_count, refreshed_at) VALUES {values}"
        ))
        .execute()
        .await
}

async fn rebuild_day(
    ch_client: &clickhouse::Client,
    spec: &CohortSpec,
    day: &str,
    log_comment: &str,
) -> Result<(), clickhouse::error::Error> {
    ch_client
        .query(&format!("TRUNCATE TABLE {}", spec.staging))
        .execute()
        .await?;
    let body = select_body(spec, &day_window_clause(day));
    let insert = format!(
        "INSERT INTO {staging} {body} SETTINGS max_bytes_before_external_group_by = \
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

/// Rebuilds only the day partitions whose source watermark advanced since the
/// last run, then prunes agg days that fell out of the horizon. On a cold start
/// (no recorded state) every source day is "stale", so this also serves as the
/// initial full build — without ever scanning the full horizon when warm.
async fn refresh(
    ch_client: &clickhouse::Client,
    spec: &CohortSpec,
) -> Result<(), clickhouse::error::Error> {
    let log_comment = format!("{}_refresh", spec.table);
    let source = source_watermarks(ch_client).await?;
    let stored = stored_match_counts(ch_client, spec.table).await?;

    let stale: Vec<(String, u32, u64)> = source
        .iter()
        .filter(|row| {
            let prev = stored.get(&row.day).copied().unwrap_or(0);
            row.n_matches > prev + MIN_NEW_MATCHES
        })
        .map(|row| (row.day.clone(), row.max_created, row.n_matches))
        .collect();
    for (day, _, _) in &stale {
        rebuild_day(ch_client, spec, day, &log_comment).await?;
    }
    record_watermarks(ch_client, spec.table, &stale).await?;

    let dropped = if let Some(oldest_fresh) = source.iter().map(|r| &r.day).min() {
        let stale_partitions: Vec<String> = distinct_days(ch_client, spec.table)
            .await?
            .into_iter()
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

pub(crate) fn spawn_cohort_agg_refresh(ch_client: clickhouse::Client) {
    let ch_client = ch_client.with_setting("max_execution_time", "600");
    tokio::spawn(async move {
        let specs = cohort_specs();
        info!(
            "cohort agg refresh started: watermark-driven, every {REFRESH_INTERVAL_SECS}s rebuild \
             only days changed since last run (horizon {HORIZON_DAYS}d)"
        );
        if let Err(e) = ensure_state_table(&ch_client).await {
            error!("cohort agg state table init failed: {e}");
        }
        let mut tick = interval(Duration::from_secs(REFRESH_INTERVAL_SECS));
        loop {
            tick.tick().await;
            for spec in &specs {
                if let Err(e) = refresh(&ch_client, spec).await {
                    error!("cohort agg refresh for {} failed: {e}", spec.table);
                }
            }
        }
    });
}
