mod models;

use crate::models::active_match::{ActiveMatch, ClickHouseActiveMatch};
use arl::RateLimiter;
use clickhouse::Client;
use delay_map::HashSetDelay;
use std::sync::LazyLock;
use std::time::Duration;

static CLICKHOUSE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("CLICKHOUSE_URL").unwrap_or("http://localhost:8123".to_string())
});
static CLICKHOUSE_USER: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_USER").unwrap());
static CLICKHOUSE_PASSWORD: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_PASSWORD").unwrap());
static CLICKHOUSE_DB: LazyLock<String> = LazyLock::new(|| std::env::var("CLICKHOUSE_DB").unwrap());

static ACTIVE_MATCHES_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("ACTIVE_MATCHES_URL")
        .unwrap_or("https://data.deadlock-api.com/v1/active-matches?api_key=HEXE-af8507d1-8f49-4f2b-81fd-b257cd23c58a".to_string())
});

#[tokio::main]
async fn main() {
    let client = Client::default()
        .with_url(CLICKHOUSE_URL.clone())
        .with_user(CLICKHOUSE_USER.clone())
        .with_password(CLICKHOUSE_PASSWORD.clone())
        .with_database(CLICKHOUSE_DB.clone());

    let mut delay_set = HashSetDelay::new(Duration::from_secs(2 * 60));

    let limiter = RateLimiter::new(1, Duration::from_secs(61));
    loop {
        limiter.wait().await;
        let start = std::time::Instant::now();
        let active_matches: Vec<ActiveMatch> = match reqwest::get(ACTIVE_MATCHES_URL.clone()).await
        {
            Ok(response) => match response.json().await {
                Ok(active_matches) => active_matches,
                Err(e) => {
                    eprintln!("Failed to parse active matches: {}", e);
                    continue;
                }
            },
            Err(e) => {
                eprintln!("Failed to fetch active matches: {}", e);
                continue;
            }
        };
        let ch_active_matches: Vec<_> = active_matches
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
                if delay_set.contains_key(&key) {
                    return false;
                }
                delay_set.insert(key);
                true
            })
            .map(ClickHouseActiveMatch::from)
            .collect();
        if ch_active_matches.is_empty() {
            continue;
        }
        let matches = ch_active_matches.len();
        let mut insert = match client.insert("active_matches") {
            Ok(insert) => insert,
            Err(e) => {
                eprintln!("Failed to create insert: {}", e);
                continue;
            }
        };
        for ch_active_match in ch_active_matches {
            match insert.write(&ch_active_match).await {
                Ok(_) => (),
                Err(e) => eprintln!("Failed to insert active match: {}", e),
            }
        }
        match insert.end().await {
            Ok(_) => (),
            Err(e) => eprintln!("Failed to commit insert: {}", e),
        }
        println!(
            "Inserted {} active matches in {:?}",
            matches,
            start.elapsed()
        );
    }
}
