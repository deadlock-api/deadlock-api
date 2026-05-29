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
#![allow(clippy::unreadable_literal)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_truncation)]

use core::time::Duration;
use std::collections::{HashMap, HashSet};

use anyhow::Result;
use cached::macros::cached;
use cached::TtlCache;
use futures::stream::StreamExt;
use itertools::Itertools;
use metrics::{counter, gauge};
use models::{SteamFriend, SteamPlayerSummary};
use tracing::{error, info, instrument, warn};

const FRIENDS_FETCH_CONCURRENCY: usize = 10;

mod models;
mod steam_api;

static FETCH_INTERVAL: std::sync::LazyLock<Duration> =
    std::sync::LazyLock::new(|| Duration::from_secs(common::env_or("FETCH_INTERVAL_SECONDS", 120)));

const OUTDATED_INTERVAL: &str = "INTERVAL 1 WEEK";

#[tokio::main]
async fn main() -> Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    info!("Starting Steam Profile Fetcher");

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;
    let pg_client = common::get_pg_client().await?;

    let mut interval = tokio::time::interval(*FETCH_INTERVAL);
    loop {
        interval.tick().await;
        if let Err(e) = fetch_and_update_profiles(&http_client, &ch_client, &pg_client).await {
            error!("Error updating Steam profiles: {e}");
        }
    }
}

#[instrument(skip_all)]
async fn fetch_and_update_profiles(
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    pg_client: &sqlx::Pool<sqlx::Postgres>,
) -> Result<()> {
    let protected_users = get_protected_users_cached(pg_client).await?;
    let account_ids = get_account_ids_to_update(ch_client)
        .await?
        .into_iter()
        .filter(|id| !protected_users.contains(id))
        .collect_vec();
    gauge!("steam_profile_fetcher.account_ids_to_update").set(account_ids.len() as f64);

    if account_ids.len() < 100 {
        info!("No full batch, waiting for next interval");
        return Ok(());
    }
    info!("Found {} account IDs to update", account_ids.len());

    let batch = account_ids.iter().take(100).collect_vec();
    let batch_ids: Vec<u32> = batch.iter().map(|&&id| id).collect();

    let (profiles_result, mut friends_by_account) = tokio::join!(
        steam_api::fetch_steam_profiles(http_client, &batch),
        fetch_friends_for_accounts(http_client, &batch_ids),
    );

    let mut profiles = match profiles_result {
        Ok(profiles) => {
            info!("Fetched {} Steam profiles", profiles.len());
            counter!("steam_profile_fetcher.fetched_profiles.success")
                .increment(profiles.len() as u64);
            profiles
        }
        Err(e) => {
            error!("Failed to fetch Steam profiles: {e}");
            counter!("steam_profile_fetcher.fetched_profiles.failure")
                .increment(batch.len() as u64);
            return Err(e);
        }
    };

    attach_friends(&mut profiles, &mut friends_by_account);

    let fetched_ids: HashSet<u32> = profiles.iter().map(|p| p.account_id).collect();
    let unavailable_profiles = batch
        .into_iter()
        .filter(|id| !fetched_ids.contains(id))
        .copied()
        .collect_vec();
    if !unavailable_profiles.is_empty() {
        match delete_profiles(ch_client, &unavailable_profiles).await {
            Ok(()) => {
                info!(
                    "Deleted {} unavailable profiles",
                    unavailable_profiles.len()
                );
                counter!("steam_profile_fetcher.deleted_profiles.success")
                    .increment(unavailable_profiles.len() as u64);
            }
            Err(e) => {
                error!("Failed to delete unavailable profiles: {e}");
                counter!("steam_profile_fetcher.deleted_profiles.failure")
                    .increment(unavailable_profiles.len() as u64);
            }
        }
    }

    match save_profiles(ch_client, &profiles).await {
        Ok(()) => {
            info!(
                "Saved {} Steam profiles, {} account IDs remaining to update",
                profiles.len(),
                account_ids.len() - profiles.len()
            );
            gauge!("steam_profile_fetcher.account_ids_to_update").decrement(profiles.len() as f64);
            counter!("steam_profile_fetcher.saved_profiles.success")
                .increment(profiles.len() as u64);
        }
        Err(e) => {
            error!("Failed to save Steam profiles: {e}");
            counter!("steam_profile_fetcher.saved_profiles.failure")
                .increment(profiles.len() as u64);
            return Err(e.into());
        }
    }

    Ok(())
}

#[instrument(skip_all, fields(accounts = account_ids.len()))]
async fn fetch_friends_for_accounts(
    http_client: &reqwest::Client,
    account_ids: &[u32],
) -> HashMap<u32, Vec<SteamFriend>> {
    let results: Vec<_> = futures::stream::iter(account_ids.iter().copied())
        .map(|account_id| async move {
            (
                account_id,
                steam_api::fetch_steam_friends(http_client, account_id).await,
            )
        })
        .buffer_unordered(FRIENDS_FETCH_CONCURRENCY)
        .collect()
        .await;

    let success = results.iter().filter(|(_, r)| r.is_ok()).count() as u64;
    let failure = results.len() as u64 - success;
    counter!("steam_profile_fetcher.fetched_friends.success").increment(success);
    counter!("steam_profile_fetcher.fetched_friends.failure").increment(failure);

    results
        .into_iter()
        .filter_map(|(account_id, result)| match result {
            Ok(friends) => Some((account_id, friends)),
            Err(e) => {
                warn!("Failed to fetch friends for {account_id}: {e}");
                None
            }
        })
        .collect()
}

fn attach_friends(
    profiles: &mut [SteamPlayerSummary],
    friends_by_account: &mut HashMap<u32, Vec<SteamFriend>>,
) {
    for profile in profiles.iter_mut() {
        let Some(friends) = friends_by_account.remove(&profile.account_id) else {
            continue;
        };
        let (ids, since): (Vec<_>, Vec<_>) = friends
            .into_iter()
            .map(|f| (f.steamid, f.friend_since))
            .unzip();
        profile.friends_account_id = ids;
        profile.friends_friend_since = since;
    }
}

async fn get_account_ids_to_update(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<Vec<u32>> {
    let query = format!(
        r"
SELECT account_id
FROM accounts_to_update FINAL
WHERE
    (last_profile_update > toDateTime(0) AND last_profile_update < now() - {OUTDATED_INTERVAL})
    OR (last_profile_update = toDateTime(0) AND last_active > now() - {OUTDATED_INTERVAL})
SETTINGS log_comment = 'steam_profile_fetcher_get_account_ids_to_update'
    "
    );
    ch_client.query(&query).fetch_all().await
}

#[instrument(skip_all)]
async fn save_profiles(
    ch_client: &clickhouse::Client,
    profiles: &[SteamPlayerSummary],
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client
        .insert::<SteamPlayerSummary>("steam_profiles")
        .await?;
    for profile in profiles {
        inserter.write(profile).await?;
    }
    inserter.end().await
}

#[instrument(skip_all)]
async fn delete_profiles(
    ch_client: &clickhouse::Client,
    profiles: &[u32],
) -> clickhouse::error::Result<()> {
    ch_client
        .query("DELETE FROM steam_profiles WHERE account_id IN ? SETTINGS log_comment = 'steam_profile_fetcher_delete_profiles'")
        .bind(profiles)
        .execute()
        .await
}

#[cached(
    ty = "TtlCache<u8, Vec<u32>>",
    create = "{ TtlCache::with_ttl(std::time::Duration::from_secs(24 * 60 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn get_protected_users_cached(
    ph_client: &sqlx::Pool<sqlx::Postgres>,
) -> sqlx::Result<Vec<u32>> {
    let protected_users = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(ph_client)
        .await?
        .into_iter()
        .map(|r| r.steam_id)
        .map(i32::cast_unsigned)
        .collect_vec();
    Ok(protected_users)
}
