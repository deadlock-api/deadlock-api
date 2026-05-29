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

use clickhouse::Row;
use metrics::{counter, gauge};
use serde::Serialize;
use tracing::{error, info, warn};
use valveprotos::deadlock::{
    CMsgCitadelProfileCard, CMsgClientToGcGetProfileCard, EgcCitadelClientMessages,
};

const CYCLE_DURATION: Duration = Duration::from_mins(30);

#[derive(Debug, Serialize, Row)]
struct PlayerCardRow {
    account_id: u32,
    ranked_badge_level: Option<u32>,
    slots_slots_id: Vec<Option<u32>>,
    slots_hero_id: Vec<Option<u32>>,
    slots_hero_kills: Vec<Option<u32>>,
    slots_hero_wins: Vec<Option<u32>>,
    slots_stat_id: Vec<Option<i32>>,
    slots_stat_score: Vec<Option<u32>>,
}

impl From<CMsgCitadelProfileCard> for PlayerCardRow {
    fn from(card: CMsgCitadelProfileCard) -> Self {
        Self {
            account_id: card.account_id(),
            ranked_badge_level: card.ranked_badge_level,
            slots_slots_id: card.slots.iter().map(|s| s.slot_id).collect(),
            slots_hero_id: card
                .slots
                .iter()
                .filter_map(|s| s.hero.as_ref().map(|h| h.hero_id))
                .collect(),
            slots_hero_kills: card
                .slots
                .iter()
                .filter_map(|s| s.hero.as_ref().map(|h| h.hero_kills))
                .collect(),
            slots_hero_wins: card
                .slots
                .iter()
                .filter_map(|s| s.hero.as_ref().map(|h| h.hero_wins))
                .collect(),
            slots_stat_id: card
                .slots
                .iter()
                .filter_map(|s| s.stat.as_ref().map(|h| h.stat_id))
                .collect(),
            slots_stat_score: card
                .slots
                .iter()
                .filter_map(|s| s.stat.as_ref().map(|h| h.stat_score))
                .collect(),
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    info!("Starting friends-rank-fetcher");

    let http_client = reqwest::Client::new();
    let pg_client = common::get_pg_client().await?;
    let ch_client = common::get_ch_client()?;

    loop {
        let friends = match sqlx::query!("SELECT friend_id, bot_id FROM bot_friends")
            .fetch_all(&pg_client)
            .await
        {
            Ok(rows) => {
                counter!("friends_rank_fetcher.db_fetch.success").increment(1);
                rows.into_iter()
                    .map(|r| (r.friend_id, r.bot_id))
                    .collect::<Vec<_>>()
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

        let tick = (CYCLE_DURATION / u32::try_from(friends.len())?).max(Duration::from_secs(1));
        info!(
            friends = friends.len(),
            tick_ms = tick.as_millis(),
            "Starting 30-minute rank-card cycle"
        );

        // interval_at delays the first tick so all calls are evenly spaced within the window
        let start = tokio::time::Instant::now() + tick;
        let mut interval = tokio::time::interval_at(start, tick);

        for (friend_id, bot_id) in friends {
            interval.tick().await;
            info!(friend_id, bot_id, "Fetching profile card");

            let result = fetch_and_store_card(&http_client, &ch_client, friend_id, &bot_id).await;
            match result {
                Ok(()) => {
                    info!(friend_id, "Profile card stored");
                    counter!("friends_rank_fetcher.card_fetch.success").increment(1);
                }
                Err(e) => {
                    error!(friend_id, error = %e, "Failed to fetch/store profile card");
                    counter!("friends_rank_fetcher.card_fetch.failure").increment(1);
                }
            }
        }
    }
}

async fn fetch_and_store_card(
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    friend_id: i32,
    bot_id: &str,
) -> anyhow::Result<()> {
    let msg = CMsgClientToGcGetProfileCard {
        account_id: Some(friend_id.cast_unsigned()),
        dev_access_hint: None,
        friend_access_hint: true.into(),
    };
    let (_, card) = common::retry_with_backoff(|| {
        common::call_steam_proxy::<CMsgCitadelProfileCard>(
            http_client,
            EgcCitadelClientMessages::KEMsgClientToGcGetProfileCard,
            &msg,
            None,
            None,
            Duration::from_secs(10),
            None,
            Duration::from_secs(5),
            Some(bot_id),
        )
    })
    .await?;

    let row = PlayerCardRow::from(card);
    let mut inserter = ch_client.insert::<PlayerCardRow>("player_card").await?;
    inserter.write(&row).await?;
    inserter.end().await?;

    Ok(())
}
