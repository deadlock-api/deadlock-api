use anyhow::Result;
use itertools::Itertools;
use metrics::{counter, gauge};
use once_cell::sync::Lazy;
use rand::rng;
use rand::seq::SliceRandom;
use sqlx::postgres::PgQueryResult;
use sqlx::{Error, PgPool};
use std::env;
use std::time::Duration;
use tracing::{debug, error, info, instrument};
mod models;
mod steam_api;

use models::SteamPlayerSummary;

static FETCH_INTERVAL: Lazy<Duration> = Lazy::new(|| {
    Duration::from_secs(
        env::var("FETCH_INTERVAL_SECONDS")
            .unwrap_or_else(|_| "600".to_string())
            .parse()
            .unwrap_or(10 * 60),
    )
});

#[tokio::main]
async fn main() -> Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    info!("Starting Steam Profile Fetcher");

    let http_client = reqwest::Client::new();
    let ch_client = common::get_ch_client()?;
    let pg_client = common::get_pg_client().await?;

    let mut interval = tokio::time::interval(*FETCH_INTERVAL);
    loop {
        interval.tick().await;
        match fetch_and_update_profiles(&http_client, &ch_client, &pg_client).await {
            Ok(_) => info!("Updated Steam profiles"),
            Err(e) => error!("Error updating Steam profiles: {}", e),
        }
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
        return Ok(());
    }

    info!("Found {} account IDs to update", account_ids.len());
    gauge!("steam_profile_fetcher.account_ids_to_update").set(account_ids.len() as f64);

    let batch = account_ids.iter().take(100).collect_vec();
    let profiles = match steam_api::fetch_steam_profiles(http_client, &batch).await {
        Ok(profiles) => {
            info!("Fetched {} Steam profiles", profiles.len());
            counter!("steam_profile_fetcher.fetched_profiles.success")
                .increment(profiles.len() as u64);
            profiles
        }
        Err(e) => {
            error!("Failed to fetch Steam profiles: {}", e);
            counter!("steam_profile_fetcher.fetched_profiles.failure")
                .increment(account_ids.len() as u64);
            return Err(e);
        }
    };

    match save_profiles(pg_client, &profiles).await {
        Ok(_) => {
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
            error!("Failed to save Steam profiles: {}", e);
            counter!("steam_profile_fetcher.saved_profiles.failure")
                .increment(profiles.len() as u64);
            return Err(e.into());
        }
    }

    Ok(())
}

async fn get_account_ids_to_update(
    ch_client: &clickhouse::Client,
    pg_client: &PgPool,
) -> Result<Vec<u32>> {
    // Get New Accounts to Fetch
    let ch_account_ids = get_ch_account_ids(ch_client).await?;
    let pg_new_account_ids = get_pg_account_ids_new(pg_client).await?;
    let ch_account_ids = ch_account_ids
        .into_iter()
        .filter(|id| !pg_new_account_ids.contains(id))
        .unique()
        .collect_vec();
    debug!("Found {} new account IDs to update", ch_account_ids.len());

    let mut pg_outdated_account_ids = get_pg_account_ids_outdated(pg_client).await?;
    pg_outdated_account_ids.shuffle(&mut rng());
    debug!(
        "Found {} outdated account IDs to update",
        pg_outdated_account_ids.len()
    );

    Ok(ch_account_ids
        .into_iter()
        .chain(pg_outdated_account_ids.into_iter())
        .unique()
        .collect())
}

async fn get_ch_account_ids(ch_client: &clickhouse::Client) -> clickhouse::error::Result<Vec<u32>> {
    let query = "
SELECT DISTINCT account_id
FROM match_player
WHERE match_id IN (SELECT match_id FROM match_info WHERE start_time > now() - INTERVAL 2 WEEK)
AND account_id > 0
ORDER BY RAND()
    ";
    ch_client.query(query).fetch_all().await
}

async fn get_pg_account_ids_outdated(pg_client: &PgPool) -> sqlx::Result<Vec<u32>> {
    Ok(
        sqlx::query!("SELECT DISTINCT account_id FROM steam_profiles WHERE last_updated < now() - INTERVAL '2 weeks'")
            .fetch_all(pg_client)
            .await?
            .into_iter()
            .map(|row| row.account_id as u32)
            .collect(),
    )
}

async fn get_pg_account_ids_new(pg_client: &PgPool) -> sqlx::Result<Vec<u32>> {
    Ok(
        sqlx::query!("SELECT DISTINCT account_id FROM steam_profiles WHERE last_updated > now() - INTERVAL '2 weeks'")
            .fetch_all(pg_client)
            .await?
            .into_iter()
            .map(|row| row.account_id as u32)
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
