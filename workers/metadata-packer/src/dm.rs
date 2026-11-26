//! The damage matrix backfill: `match_player` rows ingested before the `damage_matrix.*` and
//! `slot_hero_ids` columns existed get them from the same metadata files.
//!
//! With `METADATA_PACKER_DM_BACKFILL=true`, each pack job builds those columns from the files it
//! packs (with the ingest's own code, [`damage_matrix_rows`]) and inserts them into the staging
//! table [`DM_TABLE`] before the pack is published. `dm-backfill-packs` does the same for
//! packs built before that, reading each pack whole. A mutation per `match_player` partition
//! then copies the staged columns into the rows that still lack them (`scripts` on the server).
//! `metadata_pack_dm` records which packs are staged.

use std::collections::BTreeMap;
use std::sync::Arc;

use bytes::Bytes;
use futures::{StreamExt as _, TryStreamExt as _};
use ingest_worker::damage_matrix_backfill::{DamageMatrixRow, damage_matrix_rows};
use metadata_packs::Kind;
use metadata_packs::format::{self, decode_sidecar};
use metrics::counter;
use object_store::ObjectStoreExt as _;
use sha2::{Digest as _, Sha256};
use tracing::{info, warn};

use crate::{Ctx, Error};

/// The `ClickHouse` staging table of the backfilled columns.
pub(crate) const DM_TABLE: &str = "match_player_dm_backfill";

/// Packs whose files are staged, so `dm-backfill-packs` skips them.
const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS metadata_pack_dm (
    pack_id bigint PRIMARY KEY,
    rows integer NOT NULL,
    unreadable integer NOT NULL,
    done_at timestamptz NOT NULL DEFAULT now()
)";

pub(crate) async fn ensure_schema(pg: &sqlx::PgPool) -> sqlx::Result<()> {
    sqlx::query(SCHEMA).execute(pg).await.map(drop)
}

/// The rows of the files of one pack, and how many files could not be read.
#[derive(Debug, Default)]
pub(crate) struct Staged {
    pub(crate) rows: Vec<DamageMatrixRow>,
    pub(crate) unreadable: usize,
}

/// Of every match the file the ingest wrote its rows from: the salt file, else the hltv one.
/// `failed/` files have no rows.
fn ingested_files(files: Vec<(u64, Kind, Bytes)>) -> Vec<Bytes> {
    let mut chosen: BTreeMap<u64, (Kind, Bytes)> = BTreeMap::new();
    for (match_id, kind, data) in files {
        if !matches!(kind, Kind::Salt | Kind::Hltv) {
            continue;
        }
        match chosen.get(&match_id) {
            Some((existing, _)) if *existing <= kind => {}
            _ => {
                chosen.insert(match_id, (kind, data));
            }
        }
    }
    chosen.into_values().map(|(_, data)| data).collect()
}

/// Builds the rows of `files` on `threads` blocking threads.
pub(crate) async fn build(files: Vec<(u64, Kind, Bytes)>, threads: usize) -> Staged {
    let files = ingested_files(files);
    let per_thread = files.len().div_ceil(threads.max(1)).max(1);
    let mut chunks = Vec::new();
    let mut files = files.into_iter().peekable();
    while files.peek().is_some() {
        chunks.push(files.by_ref().take(per_thread).collect::<Vec<_>>());
    }
    let built = futures::future::join_all(chunks.into_iter().map(|chunk| {
        tokio::task::spawn_blocking(move || {
            let mut staged = Staged::default();
            for data in chunk {
                match damage_matrix_rows(&data) {
                    Ok(rows) => staged.rows.extend(rows),
                    Err(e) => {
                        staged.unreadable = staged.unreadable.saturating_add(1);
                        tracing::debug!("No damage matrix rows: {e}");
                    }
                }
            }
            staged
        })
    }))
    .await;
    let mut staged = Staged::default();
    for result in built {
        match result {
            Ok(part) => {
                staged.rows.extend(part.rows);
                staged.unreadable = staged.unreadable.saturating_add(part.unreadable);
            }
            Err(e) => {
                warn!("A damage matrix build task failed: {e}");
                staged.unreadable = staged.unreadable.saturating_add(1);
            }
        }
    }
    counter!("metadata_packer.dm_rows")
        .increment(u64::try_from(staged.rows.len()).unwrap_or_default());
    counter!("metadata_packer.dm_unreadable")
        .increment(u64::try_from(staged.unreadable).unwrap_or_default());
    staged
}

/// Writes the rows to [`DM_TABLE`]. Rows of fresh files span every partition of
/// `match_player`, beyond the server's default of 100 per insert.
pub(crate) async fn insert(
    ch: &clickhouse::Client,
    rows: &[DamageMatrixRow],
) -> clickhouse::error::Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let ch = ch
        .clone()
        .with_setting("max_partitions_per_insert_block", "1000");
    clickhouse_utils::insert_rows(&ch, DM_TABLE, rows).await
}

/// Records that the files of `pack_id` are staged.
pub(crate) async fn mark_done(
    pg: &sqlx::PgPool,
    pack_id: u64,
    staged: &Staged,
) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO metadata_pack_dm (pack_id, rows, unreadable) VALUES ($1, $2, $3)
         ON CONFLICT (pack_id) DO UPDATE SET rows = EXCLUDED.rows,
            unreadable = EXCLUDED.unreadable, done_at = now()",
    )
    .bind(i64::try_from(pack_id).unwrap_or(i64::MAX))
    .bind(i32::try_from(staged.rows.len()).unwrap_or(i32::MAX))
    .bind(i32::try_from(staged.unreadable).unwrap_or(i32::MAX))
    .execute(pg)
    .await
    .map(drop)
}

/// Stages the files of one already published pack: its sidecar names them, one GET reads them.
async fn backfill_pack(ctx: &Ctx, ch: &clickhouse::Client, pack_id: u64) -> Result<Staged, Error> {
    let store = &ctx.packs.store;
    ctx.limiter.acquire().await;
    let sidecar = store
        .get(&format::sidecar_key(&ctx.cfg.prefix, pack_id))
        .await?
        .bytes()
        .await?;
    let (header, entries) =
        decode_sidecar(&sidecar).map_err(|e| Error::Failed(format!("sidecar {pack_id}: {e}")))?;
    ctx.limiter.acquire().await;
    let pack = store
        .get(&format::pack_key(&ctx.cfg.prefix, pack_id))
        .await?
        .bytes()
        .await?;
    let sha: [u8; 32] = Sha256::digest(&pack).into();
    if sha != header.pack_sha256 {
        return Err(Error::Failed(format!(
            "pack {pack_id} does not match its sidecar"
        )));
    }
    let mut files = Vec::with_capacity(entries.len());
    for entry in &entries {
        let range = entry
            .range()
            .and_then(|r| Some(usize::try_from(r.start).ok()?..usize::try_from(r.end).ok()?))
            .filter(|r| r.end <= pack.len())
            .ok_or_else(|| Error::Failed(format!("pack {pack_id}: entry out of range")))?;
        files.push((entry.match_id, entry.kind, pack.slice(range)));
    }
    let staged = build(files, ctx.cfg.dm_threads).await;
    insert(ch, &staged.rows)
        .await
        .map_err(|e| Error::Failed(format!("staging pack {pack_id}: {e}")))?;
    mark_done(ctx.pg(), pack_id, &staged).await?;
    Ok(staged)
}

/// Stages every published pack not staged yet, up to `max_pack_id`.
pub(crate) async fn backfill_packs(
    ctx: Arc<Ctx>,
    max_pack_id: Option<u64>,
    concurrency: usize,
) -> Result<(), Error> {
    let ch = ctx
        .ch
        .clone()
        .ok_or_else(|| Error::Failed("no ClickHouse client".to_owned()))?;
    let ids: Vec<i64> = sqlx::query_scalar(
        "SELECT p.pack_id FROM metadata_packs p
         WHERE NOT EXISTS (SELECT 1 FROM metadata_pack_dm d WHERE d.pack_id = p.pack_id)
           AND p.pack_id <= $1
         ORDER BY p.pack_id",
    )
    .bind(max_pack_id.map_or(i64::MAX, |id| i64::try_from(id).unwrap_or(i64::MAX)))
    .fetch_all(ctx.pg())
    .await?;
    let total = ids.len();
    info!("Staging the damage matrix of {total} packs");
    let shutdown = service_utils::shutdown_token();
    let done = futures::stream::iter(ids)
        .take_until(shutdown.cancelled_owned())
        .map(|id| {
            let ctx = Arc::clone(&ctx);
            let ch = ch.clone();
            async move {
                let pack_id = u64::try_from(id).unwrap_or_default();
                let staged = backfill_pack(&ctx, &ch, pack_id).await?;
                info!(
                    "Staged pack {pack_id}: {} rows, {} unreadable files",
                    staged.rows.len(),
                    staged.unreadable
                );
                Ok::<_, Error>(())
            }
        })
        .buffer_unordered(concurrency.max(1))
        .try_fold(0usize, |n, ()| async move { Ok(n.saturating_add(1)) })
        .await?;
    info!("Staged {done} of {total} packs");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_salt_file_wins_and_failed_files_are_skipped() {
        let file = |s: &'static [u8]| Bytes::from_static(s);
        let chosen = ingested_files(vec![
            (1, Kind::Hltv, file(b"1h")),
            (1, Kind::Salt, file(b"1s")),
            (2, Kind::Hltv, file(b"2h")),
            (3, Kind::FailedSalt, file(b"3f")),
            (4, Kind::Salt, file(b"4s")),
            (4, Kind::FailedHltv, file(b"4f")),
        ]);
        assert_eq!(chosen, vec![file(b"1s"), file(b"2h"), file(b"4s")]);
    }
}
