//! Packs the loose match metadata files of both buckets into large objects in the pack bucket,
//! publishes them to the Postgres index and deletes the loose files once every reader can find
//! them in a pack. See `metadata_packs` for the format; the plan is the module docs of each step.

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

use std::sync::Arc;

use clap::{Parser, Subcommand};
use metadata_packs::Index;
use object_store::ObjectStore;
use tracing::{error, info};

mod config;
mod delete;
mod inventory;
mod packing;
mod queue;
mod rate;
mod reconcile;
mod room;
mod verify;

use config::Config;
use rate::RateLimiter;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[derive(Debug, Parser)]
#[command(about = "Packs loose match metadata files into large objects")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Inventories the main bucket, packs, publishes and deletes until shut down.
    Run,
    /// Lists the loose metadata files of a bucket into the work queue.
    Inventory {
        /// The archive (pack) bucket instead of the main one.
        #[arg(long)]
        archive: bool,
    },
    /// Moves loose files from the pack bucket to the main bucket to make room for packs.
    MakeRoom {
        #[arg(long)]
        count: usize,
    },
    /// Publishes every sidecar of the pack bucket: rebuilds the index from S3 alone.
    RebuildIndex,
    /// Compares random packed files with the loose objects they were packed from.
    VerifySample {
        #[arg(long, default_value_t = 1000)]
        count: usize,
    },
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error(transparent)]
    Metrics(#[from] telemetry::MetricsError),
    #[error(transparent)]
    Clients(#[from] db_clients::ClientError),
    #[error(transparent)]
    Sql(#[from] sqlx::Error),
    #[error(transparent)]
    Store(#[from] object_store::Error),
    #[error("S3_ARCHIVE_BUCKET_NAME must name the pack bucket")]
    NoArchive,
    #[error(transparent)]
    Var(#[from] std::env::VarError),
    #[error("{0}")]
    Failed(String),
}

/// A bucket and the name its rows carry in the work queue.
#[derive(Debug, Clone)]
pub(crate) struct Bucket {
    pub(crate) name: String,
    pub(crate) store: Arc<dyn ObjectStore>,
}

/// Everything the steps share.
#[derive(Debug)]
pub(crate) struct Ctx {
    pub(crate) cfg: Config,
    pub(crate) index: Index,
    /// Where new files arrive (`ingest/` and the `processed/` staging).
    pub(crate) main: Bucket,
    /// The full archive bucket, which also holds the packs (bucket ordinal 0 in the index).
    pub(crate) packs: Bucket,
    pub(crate) limiter: RateLimiter,
}

impl Ctx {
    pub(crate) fn bucket(&self, name: &str) -> Option<&Bucket> {
        [&self.main, &self.packs]
            .into_iter()
            .find(|b| b.name == name)
    }

    pub(crate) const fn pg(&self) -> &sqlx::PgPool {
        self.index.pool()
    }

    pub(crate) async fn flag(&self, key: &str) -> bool {
        queue::flag(self.pg(), key).await
    }
}

/// The index's ordinal of the pack bucket.
pub(crate) const PACK_BUCKET: u16 = 0;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let _otel_guard = telemetry::init_tracing(env!("CARGO_PKG_NAME"));
    let cli = Cli::parse();
    if matches!(cli.command, Command::Run) {
        telemetry::init_metrics()?;
    }
    let cfg = Config::from_env();
    let main_store: Arc<dyn ObjectStore> = Arc::new(db_clients::get_store()?);
    let pack_store: Arc<dyn ObjectStore> =
        Arc::new(db_clients::get_archive_store()?.ok_or(Error::NoArchive)?);
    let index = Index::new(db_clients::get_pg_client().await?);
    index.ensure_schema().await?;
    let ctx = Arc::new(Ctx {
        limiter: RateLimiter::per_second(cfg.requests_per_s),
        cfg,
        index,
        main: Bucket {
            name: std::env::var("S3_BUCKET_NAME")?,
            store: main_store,
        },
        packs: Bucket {
            name: std::env::var("S3_ARCHIVE_BUCKET_NAME")?,
            store: pack_store,
        },
    });
    info!(
        "Main bucket {}, pack bucket {} (prefix {}), {} req/s",
        ctx.main.name, ctx.packs.name, ctx.cfg.prefix, ctx.cfg.requests_per_s
    );

    match cli.command {
        Command::Run => run(ctx).await,
        Command::Inventory { archive } => {
            let bucket = if archive { &ctx.packs } else { &ctx.main };
            let listed = inventory::inventory(&ctx, bucket).await?;
            info!("Listed {listed} loose files in {}", bucket.name);
            Ok(())
        }
        Command::MakeRoom { count } => {
            let moved = room::make_room(&ctx, count).await?;
            info!(
                "Moved {moved} files from {} to {}",
                ctx.packs.name, ctx.main.name
            );
            Ok(())
        }
        Command::RebuildIndex => {
            let stats = reconcile::reconcile(&ctx, true).await?;
            info!("Rebuilt the index: {stats:?}");
            Ok(())
        }
        Command::VerifySample { count } => {
            let report = verify::verify_sample(&ctx, count).await?;
            info!("{report:?}");
            if report.mismatched > 0 || report.errors > 0 {
                return Err(Error::Failed(format!("verification failed: {report:?}")));
            }
            Ok(())
        }
    }
}

async fn run(ctx: Arc<Ctx>) -> Result<(), Error> {
    let shutdown = service_utils::shutdown_token();
    let mut tasks = tokio::task::JoinSet::new();
    tasks.spawn(inventory::inventory_loop(
        Arc::clone(&ctx),
        shutdown.clone(),
    ));
    tasks.spawn(packing::pack_loop(Arc::clone(&ctx), shutdown.clone()));
    tasks.spawn(delete::delete_loop(Arc::clone(&ctx), shutdown.clone()));
    tasks.spawn(reconcile::reconcile_loop(
        Arc::clone(&ctx),
        shutdown.clone(),
    ));
    tasks.spawn(queue::stats_loop(Arc::clone(&ctx), shutdown.clone()));
    while let Some(done) = tasks.join_next().await {
        if let Err(e) = done {
            error!("A packer task failed: {e}");
            shutdown.cancel();
        }
    }
    info!("Shut down");
    Ok(())
}
