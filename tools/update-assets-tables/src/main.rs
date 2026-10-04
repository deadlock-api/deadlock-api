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

use metrics::counter;
use models::{Hero, Item};
use tracing::{debug, error, info, instrument, warn};

use crate::models::{ChHero, ChItem, ItemType};

mod models;

const UPDATE_INTERVAL_S: u64 = 60 * 60; // Run every hour
const REQUEST_TIMEOUT_S: u64 = 60;
const CONNECT_TIMEOUT_S: u64 = 10;
const MAX_FETCH_ATTEMPTS: u32 = 4;
const CACHE_BUST_AFTER_ATTEMPTS: u32 = 2;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;

    let mut interval = tokio::time::interval(Duration::from_secs(UPDATE_INTERVAL_S));
    let ch_client = common::get_ch_client()?;
    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_S))
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_S))
        .build()?;
    loop {
        interval.tick().await;

        info!("Updating assets");
        let (heroes_result, items_result) = tokio::join!(
            update_heroes(&ch_client, &http_client),
            update_items(&ch_client, &http_client),
        );
        if let Err(e) = heroes_result {
            error!("Failed to update heroes: {e}");
        }
        if let Err(e) = items_result {
            error!("Failed to update items: {e}");
        }
        info!("Updated assets");
    }
}

async fn fetch_with_retries<T: serde::de::DeserializeOwned>(
    http_client: &reqwest::Client,
    base_url: &str,
) -> anyhow::Result<T> {
    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 1..=MAX_FETCH_ATTEMPTS {
        let url = if attempt > CACHE_BUST_AFTER_ATTEMPTS {
            let bust = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.as_millis());
            let sep = if base_url.contains('?') { '&' } else { '?' };
            format!("{base_url}{sep}_cb={bust}")
        } else {
            base_url.to_owned()
        };

        let result: anyhow::Result<T> = async {
            let resp = http_client.get(&url).send().await?.error_for_status()?;
            Ok(resp.json::<T>().await?)
        }
        .await;

        match result {
            Ok(v) => return Ok(v),
            Err(e) => {
                warn!("Fetch attempt {attempt}/{MAX_FETCH_ATTEMPTS} for {base_url} failed: {e}");
                last_err = Some(e);
                if attempt < MAX_FETCH_ATTEMPTS {
                    let backoff = Duration::from_secs(2u64.pow(attempt - 1));
                    tokio::time::sleep(backoff).await;
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("fetch failed with no error captured")))
}

#[instrument(skip_all)]
async fn update_heroes(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
) -> anyhow::Result<()> {
    info!("Updating heroes");
    let heroes: Vec<Hero> = fetch_with_retries(
        http_client,
        "https://api.deadlock-api.com/v1/assets/heroes?only_active=true",
    )
    .await?;
    let fetched = heroes.len();
    info!("Fetched {fetched} heroes from upstream");

    let staging = create_staging(ch_client, "heroes").await?;
    let mut insert = sync_insert_client(ch_client)
        .insert::<ChHero>(&staging)
        .await?;
    let mut inserted: u32 = 0;
    let mut skipped_disabled: u32 = 0;
    let mut skipped_in_dev: u32 = 0;
    for hero in heroes {
        if hero.disabled.is_some_and(|d| d) {
            debug!("Hero {} is disabled, skipping", hero.name);
            skipped_disabled += 1;
            continue;
        }
        if hero.in_development.is_some_and(|d| d) {
            debug!("Hero {} is in development, skipping", hero.name);
            skipped_in_dev += 1;
            continue;
        }
        debug!("Inserting hero {} (id={})", hero.name, hero.id);
        let ch_hero: ChHero = hero.into();
        insert.write(&ch_hero).await?;
        inserted += 1;
        counter!("assets_updater.heroes.updated").increment(1);
    }
    insert.end().await?;
    if inserted == 0 {
        warn!(
            "0 heroes to insert, keeping the current table (fetched={fetched}, \
             skipped_disabled={skipped_disabled}, skipped_in_dev={skipped_in_dev})"
        );
        return Ok(());
    }
    swap_in(ch_client, "heroes", &staging, inserted).await?;
    info!(
        "Updated heroes: inserted={inserted}, skipped_disabled={skipped_disabled}, \
         skipped_in_dev={skipped_in_dev}, fetched={fetched}"
    );
    Ok(())
}

#[instrument(skip_all)]
async fn update_items(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
) -> anyhow::Result<()> {
    info!("Updating items");
    let raw_items: Vec<Item> =
        fetch_with_retries(http_client, "https://api.deadlock-api.com/v1/assets/items").await?;
    let fetched = raw_items.len();
    info!("Fetched {fetched} items from upstream");

    let mut skipped_not_shopable: u32 = 0;
    let mut skipped_unknown_type: u32 = 0;
    let items: Vec<Item> = raw_items
        .into_iter()
        .filter(|i| {
            let keep = i.shopable.is_none_or(|s| s);
            if !keep {
                skipped_not_shopable += 1;
                debug!("Item {} skipped: not shopable", i.name);
            }
            keep
        })
        .filter(|i| {
            let keep = i.r#type != ItemType::Unknown;
            if !keep {
                skipped_unknown_type += 1;
                debug!("Item {} skipped: unknown type", i.name);
            }
            keep
        })
        .collect();

    let staging = create_staging(ch_client, "items").await?;
    let mut insert = sync_insert_client(ch_client)
        .insert::<ChItem>(&staging)
        .await?;
    let mut inserted: u32 = 0;
    for item in items {
        debug!("Inserting item {} (id={})", item.name, item.id);
        insert.write(&item.into()).await?;
        inserted += 1;
        counter!("assets_updater.items.updated").increment(1);
    }
    insert.end().await?;
    if inserted == 0 {
        warn!(
            "0 items to insert, keeping the current table (fetched={fetched}, \
             skipped_not_shopable={skipped_not_shopable}, \
             skipped_unknown_type={skipped_unknown_type})"
        );
        return Ok(());
    }
    swap_in(ch_client, "items", &staging, inserted).await?;
    info!(
        "Updated items: inserted={inserted}, skipped_not_shopable={skipped_not_shopable}, \
         skipped_unknown_type={skipped_unknown_type}, fetched={fetched}"
    );
    Ok(())
}

// The tables used to be refreshed with TRUNCATE + INSERT. The server runs inserts
// asynchronously by default, so the table stayed empty for ~10 s until the insert flushed,
// and queries in that window (e.g. the item stats upgrade filter, cached for hours) saw no
// rows. Now the new rows go into a staging table that is swapped in atomically: readers see
// either the old or the new rows, never an empty table.

/// Recreates `{table}_staging` from the live table, so its schema always matches and a swap
/// can never bring back an outdated one. The previous run's rows are dropped with it.
async fn create_staging(ch_client: &clickhouse::Client, table: &str) -> anyhow::Result<String> {
    let staging = format!("{table}_staging");
    ch_client
        .query(&format!("DROP TABLE IF EXISTS {staging} SYNC"))
        .execute()
        .await?;
    ch_client
        .query(&format!("CREATE TABLE {staging} AS {table}"))
        .execute()
        .await?;
    Ok(staging)
}

/// A client whose inserts are synchronous, so the rows are in the table once `end()` returns.
fn sync_insert_client(ch_client: &clickhouse::Client) -> clickhouse::Client {
    ch_client.clone().with_setting("async_insert", "0")
}

/// Swaps the filled staging table in after checking it holds every inserted row.
async fn swap_in(
    ch_client: &clickhouse::Client,
    table: &str,
    staging: &str,
    inserted: u32,
) -> anyhow::Result<()> {
    let staged: u64 = ch_client
        .query(&format!("SELECT count() FROM {staging}"))
        .fetch_one()
        .await?;
    anyhow::ensure!(
        staged == u64::from(inserted),
        "{staging} holds {staged} rows, expected {inserted}; keeping the current {table}"
    );
    ch_client
        .query(&format!("EXCHANGE TABLES {table} AND {staging}"))
        .execute()
        .await?;
    Ok(())
}
