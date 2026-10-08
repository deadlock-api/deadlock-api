#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![expect(clippy::cast_precision_loss)]

mod models;

use core::time::Duration;
use std::collections::HashSet;
use std::sync::LazyLock;

use metrics::{counter, gauge};
use tracing::{debug, error, info, instrument};

use crate::models::active_match::{ActiveMatch, ClickHouseActiveMatch};

static ACTIVE_MATCHES_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("ACTIVE_MATCHES_URL")
        .unwrap_or("https://api.deadlock-api.com/v1/matches/active".to_string())
});

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;
    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;

    // Snapshots inserted on the previous tick. Ticks are ~2 min apart, so this
    // suppresses a snapshot that is unchanged for one tick and re-inserts it on the
    // one after, the same ~4 min dedup window as before, without keeping any key
    // longer than one tick.
    let mut previous_tick = HashSet::new();
    let mut interval = tokio::time::interval(Duration::from_secs(2 * 60 + 1));

    common::run_until_shutdown(async move {
        loop {
            interval.tick().await;
            previous_tick =
                fetch_insert_active_matches(&http_client, &ch_client, &previous_tick).await;
        }
    })
    .await
}

type SnapshotKey = (u64, u32, u32, u16, u16, u16, u16);

/// Returns the snapshot keys inserted on this tick.
#[instrument(skip(http_client, ch_client, previous_tick))]
async fn fetch_insert_active_matches(
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    previous_tick: &HashSet<SnapshotKey>,
) -> HashSet<SnapshotKey> {
    let mut this_tick = HashSet::new();
    let active_matches = match fetch_active_matches(http_client).await {
        Ok(value) => {
            gauge!("active_matches_scraper.fetched_active_matches").set(value.len() as f64);
            counter!("active_matches_scraper.fetch_active_matches.success").increment(1);
            debug!("Successfully fetched active_matches");
            value
        }
        Err(e) => {
            gauge!("active_matches_scraper.fetched_active_matches").set(0);
            counter!("active_matches_scraper.fetch_active_matches.failure").increment(1);
            error!("Failed to fetch active matches: {e:?}");
            return this_tick;
        }
    };
    let ch_active_matches = active_matches
        .into_iter()
        .filter(|am| {
            let key = (
                am.match_id,
                am.net_worth_team_0,
                am.net_worth_team_1,
                am.objectives_mask_team0,
                am.objectives_mask_team1,
                am.spectators,
                am.open_spectator_slots,
            );
            !previous_tick.contains(&key) && this_tick.insert(key)
        })
        .map(ClickHouseActiveMatch::from)
        .collect::<Vec<_>>();
    if ch_active_matches.is_empty() {
        info!("No new active matches found");
        return this_tick;
    }
    match insert_active_matches(ch_client, &ch_active_matches).await {
        Ok(()) => {
            gauge!("active_matches_scraper.inserted_active_matches")
                .set(ch_active_matches.len() as f64);
            counter!("active_matches_scraper.insert_active_matches.success").increment(1);
            info!("Inserted {} active matches", ch_active_matches.len());
        }
        Err(e) => {
            gauge!("active_matches_scraper.inserted_active_matches").set(0);
            counter!("active_matches_scraper.insert_active_matches.failure").increment(1);
            error!("Failed to insert active matches: {e:?}");
        }
    }
    this_tick
}

#[instrument(skip(ch_client))]
async fn insert_active_matches(
    ch_client: &clickhouse::Client,
    ch_active_matches: &[ClickHouseActiveMatch],
) -> clickhouse::error::Result<()> {
    let mut insert = ch_client
        .insert::<ClickHouseActiveMatch>("active_matches")
        .await?;
    for ch_active_match in ch_active_matches {
        insert.write(ch_active_match).await?;
    }
    insert.end().await
}

#[instrument(skip(http_client))]
async fn fetch_active_matches(http_client: &reqwest::Client) -> reqwest::Result<Vec<ActiveMatch>> {
    http_client
        .get(ACTIVE_MATCHES_URL.clone())
        .send()
        .await?
        .json()
        .await
}
