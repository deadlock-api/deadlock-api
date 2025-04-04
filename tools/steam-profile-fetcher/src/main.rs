use anyhow::Result;
use chrono::{DateTime, Utc};
use metrics::{counter, gauge};
use once_cell::sync::Lazy;
use sqlx::types::chrono;
use sqlx::PgPool;
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
            .unwrap_or_else(|_| "5".to_string())
            .parse()
            .unwrap_or(5),
    )
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

    loop {
        match fetch_and_update_profiles(&http_client, &ch_client, &pg_client).await {
            Ok(_) => info!("Updated Steam profiles"),
            Err(e) => error!("Error updating Steam profiles: {}", e),
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
        let profiles = steam_api::fetch_steam_profiles(http_client, chunk).await?;

        if !profiles.is_empty() {
            save_profiles(pg_client, &profiles).await?;
            remaining -= profiles.len();
            info!("{} account IDs remaining to update", remaining);
            gauge!("steam_profile_fetcher.account_ids_to_update").decrement(profiles.len() as f64);
        }

        debug!("Sleeping for {:?} before next batch", *FETCH_INTERVAL);
        sleep(*FETCH_INTERVAL).await;
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
        WHERE account_id > 0
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
async fn save_profiles(pg_client: &PgPool, profiles: &[SteamPlayerSummary]) -> Result<()> {
    for profile in profiles {
        let account_id = common::steam_id64_to_account_id(profile.steamid.parse()?) as i32;
        debug!("Saving profile for account ID {}", account_id);
        sqlx::query!(
            r#"
            INSERT INTO steam_profiles (
                account_id, personaname, profileurl,
                avatar, avatarmedium, avatarfull, personastate, communityvisibilitystate,
                realname, loccountrycode
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (account_id)
            DO UPDATE SET
                personaname = EXCLUDED.personaname,
                profileurl = EXCLUDED.profileurl,
                avatar = EXCLUDED.avatar,
                avatarmedium = EXCLUDED.avatarmedium,
                avatarfull = EXCLUDED.avatarfull,
                personastate = EXCLUDED.personastate,
                communityvisibilitystate = EXCLUDED.communityvisibilitystate,
                realname = EXCLUDED.realname,
                loccountrycode = EXCLUDED.loccountrycode
            "#,
            account_id,
            profile.personaname,
            profile.profileurl,
            profile.avatar,
            profile.avatarmedium,
            profile.avatarfull,
            profile.personastate as i32,
            profile.communityvisibilitystate as i32,
            profile.realname,
            profile.loccountrycode,
        )
        .execute(pg_client)
        .await?;
    }

    info!("Saved {} Steam profiles", profiles.len());
    counter!("steam_profile_fetcher.saved_profiles").increment(profiles.len() as u64);
    Ok(())
}
