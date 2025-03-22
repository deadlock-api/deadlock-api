mod models;

use crate::models::active_match::{ActiveMatch, ClickHouseActiveMatch};
use delay_map::HashSetDelay;
use metrics::{counter, gauge};
use std::sync::LazyLock;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, error, info, instrument};

static ACTIVE_MATCHES_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("ACTIVE_MATCHES_URL")
        .unwrap_or("https://api.deadlock-api.com/v1/matches/active".to_string())
});

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;
    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;

    let mut delay_set = HashSetDelay::new(Duration::from_secs(2 * 60));

    loop {
        fetch_insert_active_matches(&http_client, &ch_client, &mut delay_set).await;
        sleep(Duration::from_secs(61)).await;
    }
}

#[instrument(skip(http_client, ch_client, delay_set))]
async fn fetch_insert_active_matches(
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    delay_set: &mut HashSetDelay<(u64, u32, u32, u16, u16, u16, u16)>,
) {
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
            error!("Failed to fetch active matches: {}", e);
            return;
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
            let is_new = !delay_set.contains_key(&key);
            if is_new {
                delay_set.insert(key);
            }
            is_new
        })
        .map(ClickHouseActiveMatch::from)
        .collect::<Vec<_>>();
    if ch_active_matches.is_empty() {
        info!("No new active matches found");
        return;
    }
    match insert_active_matches(ch_client, &ch_active_matches).await {
        Ok(_) => {
            gauge!("active_matches_scraper.inserted_active_matches")
                .set(ch_active_matches.len() as f64);
            counter!("active_matches_scraper.insert_active_matches.success").increment(1);
            info!("Inserted {} active matches", ch_active_matches.len());
        }
        Err(e) => {
            gauge!("active_matches_scraper.inserted_active_matches").set(0);
            counter!("active_matches_scraper.insert_active_matches.failure").increment(1);
            error!("Failed to insert active matches: {}", e);
        }
    }
}

#[instrument(skip(ch_client))]
async fn insert_active_matches(
    ch_client: &clickhouse::Client,
    ch_active_matches: &[ClickHouseActiveMatch],
) -> clickhouse::error::Result<()> {
    let mut insert = ch_client.insert("active_matches")?;
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
