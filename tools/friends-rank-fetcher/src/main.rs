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

use core::time::Duration;

use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    let http_client = reqwest::Client::new();
    let pg_client = common::get_pg_client().await?;

    loop {
        let friends = sqlx::query!("SELECT friend_id FROM bot_friends")
            .fetch_all(&pg_client)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|r| r.friend_id)
            .collect::<Vec<_>>();
        if friends.is_empty() {
            warn!("No friends to fetch, sleeping for 10m");
            tokio::time::sleep(Duration::from_secs(10 * 60)).await;
            continue;
        }

        let mut interval =
            tokio::time::interval(Duration::from_secs(30 * 60 / friends.len() as u64));
        for friend in friends {
            interval.tick().await;
            info!("Fetching card for {friend}");
            let result = http_client
                .get(format!(
                    "https://api.deadlock-api.com/v1/players/{friend}/card"
                ))
                .send()
                .await
                .and_then(reqwest::Response::error_for_status);
            match result {
                Ok(_) => info!("Fetched card for {friend}"),
                Err(e) => error!("Failed to fetch card for {friend}: {e}"),
            }
        }
    }
}
