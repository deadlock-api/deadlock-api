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
#![allow(clippy::cast_precision_loss)]

use core::time::Duration;

use metrics::{counter, gauge};
use tracing::{error, info, warn};

const CYCLE_DURATION_SECS: u64 = 30 * 60;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    info!("Starting friends-rank-fetcher");

    let http_client = reqwest::Client::new();
    let pg_client = common::get_pg_client().await?;

    loop {
        let friends = match sqlx::query!("SELECT friend_id FROM bot_friends")
            .fetch_all(&pg_client)
            .await
        {
            Ok(rows) => {
                let ids = rows.into_iter().map(|r| r.friend_id).collect::<Vec<_>>();
                counter!("friends_rank_fetcher.db_fetch.success").increment(1);
                ids
            }
            Err(e) => {
                error!(error = %e, "Failed to fetch friends from DB, retrying in 60s");
                counter!("friends_rank_fetcher.db_fetch.failure").increment(1);
                tokio::time::sleep(Duration::from_mins(1)).await;
                continue;
            }
        };

        gauge!("friends_rank_fetcher.friends_total").set(friends.len() as f64);

        if friends.is_empty() {
            warn!("No friends in DB, sleeping for 10m");
            tokio::time::sleep(Duration::from_mins(10)).await;
            continue;
        }

        let tick_secs = (CYCLE_DURATION_SECS / friends.len() as u64).max(1);
        let tick = Duration::from_secs(tick_secs);
        info!(
            friends = friends.len(),
            tick_secs, "Starting 30-minute rank-card cycle"
        );

        // interval_at delays the first tick so all calls are evenly spaced within the window
        let start = tokio::time::Instant::now() + tick;
        let mut interval = tokio::time::interval_at(start, tick);

        for friend in friends {
            interval.tick().await;
            info!(friend_id = friend, "Fetching rank card");
            let result = common::retry_fn_with_backoff("card_fetch", async || {
                http_client
                    .get(format!(
                        "https://api.deadlock-api.com/v1/players/{friend}/card"
                    ))
                    .send()
                    .await
                    .and_then(reqwest::Response::error_for_status)
            })
            .await;
            match result {
                Ok(_) => {
                    info!(friend_id = friend, "Rank card fetched");
                    counter!("friends_rank_fetcher.card_fetch.success").increment(1);
                }
                Err(e) => {
                    error!(friend_id = friend, error = %e, "Failed to fetch rank card after retries");
                    counter!("friends_rank_fetcher.card_fetch.failure").increment(1);
                }
            }
        }
    }
}
