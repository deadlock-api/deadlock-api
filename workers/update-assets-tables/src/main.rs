#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

use core::time::Duration;

use game_assets::client::{AssetsClient, AssetsClientError};
use game_assets::versions::store::VersionStore;
use metrics::counter;
use tracing::{debug, error, info, instrument, warn};

use crate::models::{ChHero, ChItem, ItemSkip};

mod models;

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error(transparent)]
    Metrics(#[from] telemetry::MetricsError),
    #[error(transparent)]
    Env(#[from] std::env::VarError),
    #[error(transparent)]
    Clients(#[from] db_clients::ClientError),
}

#[derive(Debug, thiserror::Error)]
enum UpdateError {
    #[error(transparent)]
    Assets(#[from] AssetsClientError),
    #[error(transparent)]
    Clickhouse(#[from] clickhouse::error::Error),
    #[error("{staging} holds {staged} rows, expected {inserted}; keeping the current {table}")]
    StagingRowMismatch {
        table: String,
        staging: String,
        staged: u64,
        inserted: u32,
    },
}

const UPDATE_INTERVAL_S: u64 = 60 * 60; // Run every hour

#[tokio::main]
#[expect(
    clippy::infinite_loop,
    reason = "the service runs until run_until_shutdown drops the loop on a shutdown signal"
)]
async fn main() -> Result<(), Error> {
    let _otel_guard = telemetry::init_tracing(env!("CARGO_PKG_NAME"));
    telemetry::init_metrics()?;

    let mut interval = tokio::time::interval(Duration::from_secs(UPDATE_INTERVAL_S));
    let ch_client = db_clients::get_ch_client()?;
    // Builds the heroes and items from the versioned game files on R2, like the API's
    // /v1/assets endpoints. The refresh loop picks up a new patch within 15 minutes.
    let r2_client = db_clients::get_r2_client()?;
    let version_store = VersionStore::new();
    version_store.spawn_refresh_loop(r2_client.clone());
    let assets_client = AssetsClient::new(r2_client, version_store);
    service_utils::run_until_shutdown(async move {
        loop {
            interval.tick().await;

            info!("Updating assets");
            // Boxed: building the items in place makes these futures tens of KB.
            let (heroes_result, items_result) = tokio::join!(
                Box::pin(update_heroes(&ch_client, &assets_client)),
                Box::pin(update_items(&ch_client, &assets_client)),
            );
            if let Err(e) = heroes_result {
                error!("Failed to update heroes: {e}");
            }
            if let Err(e) = items_result {
                error!("Failed to update items: {e}");
            }
            info!("Updated assets");
        }
    })
    .await
}

#[instrument(skip_all)]
async fn update_heroes(
    ch_client: &clickhouse::Client,
    assets_client: &AssetsClient,
) -> Result<(), UpdateError> {
    info!("Updating heroes");
    let all_heroes = assets_client.heroes().await?;
    let heroes: Vec<_> = all_heroes.iter().filter(|h| h.is_active()).collect();
    let fetched = heroes.len();
    info!("Built {fetched} active heroes from the game files");

    let staging = create_staging(ch_client, "heroes").await?;
    let mut insert = sync_insert_client(ch_client)
        .insert::<ChHero>(&staging)
        .await?;
    let mut inserted: u32 = 0;
    let mut skipped_disabled: u32 = 0;
    let mut skipped_in_dev: u32 = 0;
    for hero in heroes {
        if hero.disabled {
            debug!("Hero {} is disabled, skipping", hero.name);
            skipped_disabled = skipped_disabled.saturating_add(1);
            continue;
        }
        if hero.in_development {
            debug!("Hero {} is in development, skipping", hero.name);
            skipped_in_dev = skipped_in_dev.saturating_add(1);
            continue;
        }
        let Ok(ch_hero) = ChHero::try_from(hero) else {
            warn!(
                "Hero {} has id {}, too large for the table, skipping",
                hero.name, hero.id
            );
            continue;
        };
        debug!("Inserting hero {} (id={})", hero.name, hero.id);
        insert.write(&ch_hero).await?;
        inserted = inserted.saturating_add(1);
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
    assets_client: &AssetsClient,
) -> Result<(), UpdateError> {
    info!("Updating items");
    let raw_items = assets_client.items().await?;
    let fetched = raw_items.len();
    info!("Built {fetched} items from the game files");

    let mut skipped_not_shopable: u32 = 0;
    let mut skipped_unknown_type: u32 = 0;
    let items: Vec<ChItem> = raw_items
        .iter()
        .filter_map(|i| match ChItem::try_from(i) {
            Ok(item) => Some(item),
            Err(ItemSkip::NotShopable) => {
                skipped_not_shopable = skipped_not_shopable.saturating_add(1);
                debug!("Item {} skipped: not shopable", i.class_name());
                None
            }
            Err(ItemSkip::UnknownType) => {
                skipped_unknown_type = skipped_unknown_type.saturating_add(1);
                debug!("Item {} skipped: unknown type", i.class_name());
                None
            }
        })
        .collect();

    let staging = create_staging(ch_client, "items").await?;
    let mut insert = sync_insert_client(ch_client)
        .insert::<ChItem>(&staging)
        .await?;
    let mut inserted: u32 = 0;
    for item in items {
        debug!("Inserting item {} (id={})", item.name, item.id);
        insert.write(&item).await?;
        inserted = inserted.saturating_add(1);
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
async fn create_staging(
    ch_client: &clickhouse::Client,
    table: &str,
) -> clickhouse::error::Result<String> {
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
) -> Result<(), UpdateError> {
    let staged: u64 = ch_client
        .query(&format!("SELECT count() FROM {staging}"))
        .fetch_one()
        .await?;
    if staged != u64::from(inserted) {
        return Err(UpdateError::StagingRowMismatch {
            table: table.to_owned(),
            staging: staging.to_owned(),
            staged,
            inserted,
        });
    }
    ch_client
        .query(&format!("EXCHANGE TABLES {table} AND {staging}"))
        .execute()
        .await?;
    Ok(())
}
