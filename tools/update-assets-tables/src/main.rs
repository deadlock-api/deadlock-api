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
use tracing::{debug, error, info, instrument};

use crate::models::{ChHero, ChItem, ItemType};

mod models;

const UPDATE_INTERVAL_S: u64 = 60 * 60; // Run every hour

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let mut interval = tokio::time::interval(Duration::from_secs(UPDATE_INTERVAL_S));
    let ch_client = common::get_ch_client()?;
    let http_client = reqwest::Client::new();
    loop {
        interval.tick().await;

        info!("Updating assets");
        if let Err(e) = update_heroes(&ch_client, &http_client).await {
            error!("Failed to update heroes: {e}");
        }
        if let Err(e) = update_items(&ch_client, &http_client).await {
            error!("Failed to update items: {e}");
        }
        info!("Updated assets");
    }
}

#[instrument(skip_all)]
async fn update_heroes(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
) -> anyhow::Result<()> {
    info!("Updating heroes");
    let heroes: Vec<Hero> = http_client
        .get("https://assets.deadlock-api.com/v2/heroes?only_active=true")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    // Truncate table
    ch_client.query("TRUNCATE TABLE heroes").execute().await?;

    let mut insert = ch_client.insert::<ChHero>("heroes").await?;
    for hero in heroes {
        if hero.disabled.is_some_and(|d| d) {
            debug!("Hero {} is disabled, skipping", hero.name);
            continue;
        }
        if hero.in_development.is_some_and(|d| d) {
            debug!("Hero {} is in development, skipping", hero.name);
            continue;
        }
        debug!("Inserting hero {}", hero.name);
        let ch_hero: ChHero = hero.into();
        insert.write(&ch_hero).await?;
        counter!("assets_updater.heroes.updated").increment(1);
    }
    insert.end().await?;
    info!("Updated heroes");
    Ok(())
}

#[instrument(skip_all)]
async fn update_items(
    ch_client: &clickhouse::Client,
    http_client: &reqwest::Client,
) -> anyhow::Result<()> {
    info!("Updating items");
    let items = http_client
        .get("https://assets.deadlock-api.com/v2/items")
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<Item>>()
        .await?
        .into_iter()
        .filter(|i| i.shopable.is_none_or(|s| s))
        .filter(|i| i.r#type != ItemType::Unknown);

    // Truncate table
    ch_client.query("TRUNCATE TABLE items").execute().await?;

    let mut insert = ch_client.insert::<ChItem>("items").await?;
    for item in items {
        debug!("Inserting item {}", item.name);
        insert.write(&item.into()).await?;
        counter!("assets_updater.items.updated").increment(1);
    }
    insert.end().await?;
    info!("Updated items");
    Ok(())
}
