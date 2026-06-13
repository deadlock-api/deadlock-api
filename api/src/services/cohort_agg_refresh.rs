use core::time::Duration;

use clickhouse::Row;
use serde::Deserialize;
use tokio::time::{Instant, interval, interval_at};
use tracing::{error, info};

const INCREMENTAL_INTERVAL_SECS: u64 = 30 * 60;
const FULL_REBUILD_INTERVAL_SECS: u64 = 24 * 60 * 60;
const FULL_REBUILD_HOUR_UTC: u32 = 9;
const RECENT_DAYS: u32 = 3;
const HORIZON_DAYS: u32 = 35;
const GROUP_BY_SPILL_BYTES: u64 = 8_000_000_000;
const PER_DAY_MAX_MEMORY_BYTES: u64 = 15_032_385_536;

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

fn day_window_clause(days_ago: u32) -> String {
    let lower = format!("toStartOfDay(now()) - INTERVAL {days_ago} DAY");
    format!("start_time >= {lower} AND start_time < {lower} + INTERVAL 1 DAY")
}

#[derive(Row, Deserialize)]
struct DayRow {
    day: String,
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

async fn rebuild_day(
    ch_client: &clickhouse::Client,
    spec: &CohortSpec,
    days_ago: u32,
    log_comment: &str,
) -> Result<Vec<String>, clickhouse::error::Error> {
    ch_client
        .query(&format!("TRUNCATE TABLE {}", spec.staging))
        .execute()
        .await?;
    let body = select_body(spec, &day_window_clause(days_ago));
    let insert = format!(
        "INSERT INTO {staging} {body} SETTINGS max_bytes_before_external_group_by = \
         {GROUP_BY_SPILL_BYTES}, max_threads = 8, max_memory_usage = {PER_DAY_MAX_MEMORY_BYTES}, \
         log_comment = '{log_comment}'",
        staging = spec.staging,
    );
    ch_client.query(&insert).execute().await?;
    let days = distinct_days(ch_client, spec.staging).await?;
    for day in &days {
        ch_client
            .query(&format!(
                "ALTER TABLE {table} REPLACE PARTITION '{day}' FROM {staging}",
                table = spec.table,
                staging = spec.staging,
            ))
            .execute()
            .await?;
    }
    Ok(days)
}

async fn run_incremental(
    ch_client: &clickhouse::Client,
    spec: &CohortSpec,
) -> Result<(), clickhouse::error::Error> {
    let log_comment = format!("{}_incremental", spec.table);
    let mut replaced = 0usize;
    for days_ago in 0..RECENT_DAYS {
        replaced += rebuild_day(ch_client, spec, days_ago, &log_comment)
            .await?
            .len();
    }
    info!(
        "cohort agg incremental refresh for {} replaced {replaced} day partition(s)",
        spec.table
    );
    Ok(())
}

async fn run_full(
    ch_client: &clickhouse::Client,
    spec: &CohortSpec,
) -> Result<(), clickhouse::error::Error> {
    let log_comment = format!("{}_full", spec.table);
    let mut rebuilt: Vec<String> = Vec::new();
    for days_ago in (0..HORIZON_DAYS).rev() {
        rebuilt.extend(rebuild_day(ch_client, spec, days_ago, &log_comment).await?);
    }
    let dropped = if let Some(oldest_fresh) = rebuilt.iter().min() {
        let stale: Vec<String> = distinct_days(ch_client, spec.table)
            .await?
            .into_iter()
            .filter(|d| d.as_str() < oldest_fresh.as_str())
            .collect();
        for day in &stale {
            ch_client
                .query(&format!(
                    "ALTER TABLE {table} DROP PARTITION '{day}'",
                    table = spec.table,
                ))
                .execute()
                .await?;
        }
        stale.len()
    } else {
        0
    };
    info!(
        "cohort agg full rebuild for {} rebuilt {} day(s), dropped {dropped} stale",
        spec.table,
        rebuilt.len()
    );
    Ok(())
}

fn secs_until_next_utc_hour(hour: u32) -> u64 {
    use chrono::Timelike;

    let day = 86_400u64;
    let secs_today = u64::from(chrono::Utc::now().num_seconds_from_midnight()) % day;
    let target = u64::from(hour) * 3600;
    let delta = (target + day - secs_today) % day;
    if delta == 0 { day } else { delta }
}

pub(crate) fn spawn_cohort_agg_refresh(ch_client: clickhouse::Client) {
    let ch_client = ch_client.with_setting("max_execution_time", "600");
    tokio::spawn(async move {
        let specs = cohort_specs();
        info!(
            "cohort agg refresh started: per-day incremental every {INCREMENTAL_INTERVAL_SECS}s \
             (last {RECENT_DAYS}d), full rebuild on boot + daily at {FULL_REBUILD_HOUR_UTC}:00 UTC"
        );
        for spec in &specs {
            if let Err(e) = run_full(&ch_client, spec).await {
                error!("cohort agg startup rebuild for {} failed: {e}", spec.table);
            }
        }
        let mut inc = interval(Duration::from_secs(INCREMENTAL_INTERVAL_SECS));
        let first_full =
            Instant::now() + Duration::from_secs(secs_until_next_utc_hour(FULL_REBUILD_HOUR_UTC));
        let mut full = interval_at(first_full, Duration::from_secs(FULL_REBUILD_INTERVAL_SECS));
        inc.tick().await;
        loop {
            tokio::select! {
                _ = inc.tick() => {
                    for spec in &specs {
                        if let Err(e) = run_incremental(&ch_client, spec).await {
                            error!("cohort agg incremental refresh for {} failed: {e}", spec.table);
                        }
                    }
                }
                _ = full.tick() => {
                    for spec in &specs {
                        if let Err(e) = run_full(&ch_client, spec).await {
                            error!("cohort agg full rebuild for {} failed: {e}", spec.table);
                        }
                    }
                }
            }
        }
    });
}
