use anyhow::Result;
use arl::RateLimiter;
use chrono::{DateTime, Utc};
use metrics::{counter, gauge};
use once_cell::sync::Lazy;
use sqlx::postgres::PgQueryResult;
use sqlx::types::chrono;
use sqlx::{Error, PgPool};
use std::collections::HashMap;
use std::env;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, error, info, instrument};
mod models;
mod steam_api;

use models::{AccountId, SteamPlayerSummary};

static FETCH_INTERVAL: Lazy<Duration> = Lazy::new(|| {
    Duration::from_secs(
        env::var("FETCH_INTERVAL_SECONDS")
            .unwrap_or_else(|_| "600".to_string())
            .parse()
            .unwrap_or(10 * 60),
    )
});

static REQUESTS_PER_10_MINUTES: Lazy<usize> = Lazy::new(|| {
    env::var("REQUESTS_PER_10_MINUTES")
        .unwrap_or_else(|_| "10".to_string())
        .parse()
        .unwrap_or(10)
});

static BATCH_SIZE: Lazy<usize> = Lazy::new(|| {
    env::var("BATCH_SIZE")
        .unwrap_or_else(|_| "100".to_string())
        .parse()
        .unwrap_or(100)
        .min(100) // Steam API has a limit of 100 accounts per request
});

#[tokio::main]
async fn main() -> Result<()> {
    let _guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    info!("Starting Steam Profile Fetcher");

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;
    let pg_client = common::get_pg_client().await?;

    let limiter = RateLimiter::new(*REQUESTS_PER_10_MINUTES, Duration::from_secs(10 * 60));

    loop {
        match fetch_and_update_profiles(&http_client, &ch_client, &pg_client, &limiter).await {
            Ok(_) => info!("Updated Steam profiles"),
            Err(e) => {
                error!("Error updating Steam profiles: {}", e);
                continue;
            }
        }

        debug!("Sleeping for {:?} before next update", *FETCH_INTERVAL);
        sleep(*FETCH_INTERVAL).await;
    }
}

#[instrument(skip_all)]
async fn fetch_and_update_profiles(
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    pg_client: &PgPool,
    limiter: &RateLimiter,
) -> Result<()> {
    let account_ids = get_account_ids_to_update(ch_client, pg_client).await?;

    if account_ids.is_empty() {
        info!("No new account IDs to update, sleeping 10min...");
        gauge!("steam_profile_fetcher.account_ids_to_update").set(0);
        sleep(Duration::from_secs(60 * 10)).await;
        return Ok(());
    }

    info!("Found {} account IDs to update", account_ids.len());
    gauge!("steam_profile_fetcher.account_ids_to_update").set(account_ids.len() as f64);

    let mut remaining = account_ids.len();
    for chunk in account_ids.chunks(*BATCH_SIZE) {
        limiter.wait().await;

        let profiles = match steam_api::fetch_steam_profiles(http_client, chunk).await {
            Ok(profiles) => {
                info!("Fetched {} Steam profiles", profiles.len());
                counter!("steam_profile_fetcher.fetched_profiles.success")
                    .increment(profiles.len() as u64);
                profiles
            }
            Err(e) => {
                error!("Failed to fetch Steam profiles: {}", e);
                counter!("steam_profile_fetcher.fetched_profiles.failure")
                    .increment(chunk.len() as u64);
                continue;
            }
        };

        match save_profiles(pg_client, &profiles).await {
            Ok(_) => {
                remaining -= profiles.len();
                info!(
                    "Saved {} Steam profiles, {} account IDs remaining to update",
                    profiles.len(),
                    remaining
                );
                gauge!("steam_profile_fetcher.account_ids_to_update")
                    .decrement(profiles.len() as f64);
                counter!("steam_profile_fetcher.saved_profiles.success")
                    .increment(profiles.len() as u64);
            }
            Err(e) => {
                error!("Failed to save Steam profiles: {}", e);
                counter!("steam_profile_fetcher.saved_profiles.failure")
                    .increment(profiles.len() as u64);
                continue;
            }
        }
    }

    Ok(())
}

async fn get_account_ids_to_update(
    ch_client: &clickhouse::Client,
    pg_client: &PgPool,
) -> Result<Vec<AccountId>> {
    let ch_account_ids = get_ch_account_ids(ch_client).await?;
    let pg_account_ids = get_pg_account_ids(pg_client).await?;

    let one_week_ago = Utc::now() - Duration::from_secs(7 * 24 * 60 * 60);

    // Filter out account IDs that are already in PostgreSQL
    let account_ids_to_update: Vec<AccountId> = ch_account_ids
        .into_iter()
        .filter(|id| {
            !pg_account_ids.contains_key(&id.account_id)
                || pg_account_ids[&id.account_id] < one_week_ago
        })
        .collect();

    Ok(account_ids_to_update)
}

async fn get_ch_account_ids(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<Vec<AccountId>> {
    let query = "
SELECT DISTINCT account_id
FROM match_player
WHERE match_id IN (SELECT match_id FROM match_info WHERE start_time > now() - INTERVAL 1 MONTH)
AND account_id > 0
    ";
    ch_client.query(query).fetch_all().await
}

async fn get_pg_account_ids(pg_client: &PgPool) -> sqlx::Result<HashMap<u32, DateTime<Utc>>> {
    Ok(
        sqlx::query!("SELECT DISTINCT account_id, last_updated FROM steam_profiles")
            .fetch_all(pg_client)
            .await?
            .into_iter()
            .map(|row| {
                (
                    row.account_id as u32,
                    DateTime::from_timestamp_nanos(
                        row.last_updated.assume_utc().unix_timestamp_nanos() as i64,
                    ),
                )
            })
            .collect(),
    )
}

#[instrument(skip_all)]
async fn save_profiles(
    pg_client: &PgPool,
    profiles: &[SteamPlayerSummary],
) -> std::result::Result<PgQueryResult, Error> {
    let mut query_builder = sqlx::QueryBuilder::new(
        "INSERT INTO steam_profiles (
            account_id, personaname, profileurl,
            avatar, personastate, realname, countrycode
        ) ",
    );

    query_builder.push_values(profiles, |mut b, profile| {
        b.push_bind(common::steam_id64_to_account_id(profile.steamid.parse().unwrap()) as i32)
            .push_bind(&profile.personaname)
            .push_bind(&profile.profileurl)
            .push_bind(&profile.avatar)
            .push_bind(profile.personastate as i32)
            .push_bind(&profile.realname)
            .push_bind(&profile.loccountrycode);
    });

    query_builder.push(
        " ON CONFLICT (account_id)
        DO UPDATE SET
            personaname = EXCLUDED.personaname,
            profileurl = EXCLUDED.profileurl,
            avatar = EXCLUDED.avatar,
            personastate = EXCLUDED.personastate,
            realname = EXCLUDED.realname,
            countrycode = EXCLUDED.countrycode",
    );

    let query = query_builder.build();
    query.execute(pg_client).await
}
