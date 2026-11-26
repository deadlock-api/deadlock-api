//! The work queue: one row per loose object in `metadata_pack_sources`, keyed by
//! `(bucket, key)`. It is derived state: losing it costs a new inventory, never data, because a
//! pack's sidecar names every file it holds.

use std::sync::Arc;

use metadata_packs::Kind;
use metrics::gauge;
use sqlx::PgPool;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use crate::Ctx;

// States: 0 listed and not packed yet, 1 in a published pack (deleted after the grace period).
/// Packed and deleted from its bucket.
pub(crate) const DELETED: i16 = 2;
/// A second object for the same match and kind with different bytes: kept, never deleted.
pub(crate) const CONFLICT: i16 = 5;
/// Gone before it could be packed (e.g. an hltv file replaced by the salt one).
pub(crate) const VANISHED: i16 = 7;

/// Runtime switches in `public.feature_flags` (declared by the API). Missing rows count as off.
pub(crate) const FLAG_PACK: &str = "metadata_packer";
pub(crate) const FLAG_DELETE: &str = "metadata_packer_delete";

/// A row of the queue.
#[derive(Debug, Clone)]
pub(crate) struct Pending {
    pub(crate) bucket: String,
    pub(crate) key: String,
    pub(crate) match_id: u64,
    pub(crate) kind: Kind,
    pub(crate) size: u64,
    pub(crate) etag: String,
    pub(crate) last_modified_ms: i64,
    /// Seconds since the row was listed.
    pub(crate) age_s: i64,
}

/// A listed object.
#[derive(Debug, Clone)]
pub(crate) struct Listed {
    pub(crate) key: String,
    pub(crate) match_id: u64,
    pub(crate) kind: Kind,
    pub(crate) size: u64,
    pub(crate) etag: String,
    pub(crate) last_modified_ms: i64,
}

pub(crate) async fn flag(pg: &PgPool, key: &str) -> bool {
    match sqlx::query_scalar::<_, bool>("SELECT enabled FROM feature_flags WHERE key = $1")
        .bind(key)
        .fetch_optional(pg)
        .await
    {
        Ok(enabled) => enabled.unwrap_or(false),
        Err(e) => {
            warn!("Could not read flag {key}, treating it as off: {e}");
            false
        }
    }
}

fn to_i64(value: u64) -> sqlx::Result<i64> {
    i64::try_from(value).map_err(|e| sqlx::Error::Encode(Box::new(e)))
}

/// Adds listed objects. A key that is already queued is reset to pending when its `ETag`
/// changed or it was deleted or vanished before (a new upload under the same key).
pub(crate) async fn upsert_listed(pg: &PgPool, bucket: &str, rows: &[Listed]) -> sqlx::Result<u64> {
    if rows.is_empty() {
        return Ok(0);
    }
    let mut keys = Vec::with_capacity(rows.len());
    let mut match_ids = Vec::with_capacity(rows.len());
    let mut kinds = Vec::with_capacity(rows.len());
    let mut sizes = Vec::with_capacity(rows.len());
    let mut etags = Vec::with_capacity(rows.len());
    let mut modified = Vec::with_capacity(rows.len());
    for r in rows {
        keys.push(r.key.as_str());
        match_ids.push(to_i64(r.match_id)?);
        kinds.push(r.kind.as_i16());
        sizes.push(to_i64(r.size)?);
        etags.push(r.etag.as_str());
        modified.push(r.last_modified_ms);
    }
    let result = sqlx::query(
        "INSERT INTO metadata_pack_sources AS s
            (bucket, key, match_id, kind, size, etag, last_modified)
         SELECT $1, k, m, t, z, e, to_timestamp(l / 1000.0)
         FROM UNNEST($2::text[], $3::bigint[], $4::smallint[], $5::bigint[], $6::text[], $7::bigint[])
            AS u(k, m, t, z, e, l)
         ON CONFLICT (bucket, key) DO UPDATE SET
            state = 0, etag = EXCLUDED.etag, size = EXCLUDED.size,
            last_modified = EXCLUDED.last_modified, pack_id = NULL, packed_at = NULL,
            discovered_at = now()
         WHERE s.etag <> EXCLUDED.etag OR s.state IN (2, 7)",
    )
    .bind(bucket)
    .bind(keys)
    .bind(match_ids)
    .bind(kinds)
    .bind(sizes)
    .bind(etags)
    .bind(modified)
    .execute(pg)
    .await?;
    Ok(result.rows_affected())
}

/// `bucket, key, match_id, kind, size, etag, last_modified_ms, age_s`
type PendingRow = (String, String, i64, i16, i64, String, i64, i64);

/// Up to `limit` pending rows from `match_id >= cursor`, in `(match_id, kind)` order.
pub(crate) async fn pending_from(
    pg: &PgPool,
    cursor: u64,
    limit: usize,
) -> sqlx::Result<Vec<Pending>> {
    let rows: Vec<PendingRow> = sqlx::query_as(
        "SELECT bucket, key, match_id, kind, size, etag,
                (extract(epoch FROM last_modified) * 1000)::bigint,
                extract(epoch FROM now() - discovered_at)::bigint
         FROM metadata_pack_sources
         WHERE state = 0 AND match_id >= $1
         ORDER BY match_id, kind
         LIMIT $2",
    )
    .bind(to_i64(cursor)?)
    .bind(i64::try_from(limit).unwrap_or(i64::MAX))
    .fetch_all(pg)
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(
            |(bucket, key, match_id, kind, size, etag, last_modified_ms, age_s)| {
                Some(Pending {
                    bucket,
                    key,
                    match_id: u64::try_from(match_id).ok()?,
                    kind: Kind::from_i16(kind)?,
                    size: u64::try_from(size).unwrap_or_default(),
                    etag,
                    last_modified_ms,
                    age_s,
                })
            },
        )
        .collect())
}

/// Sets the state of `(bucket, key)` rows.
pub(crate) async fn set_state(
    pg: &PgPool,
    rows: &[(String, String)],
    state: i16,
) -> sqlx::Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let (buckets, keys): (Vec<&str>, Vec<&str>) =
        rows.iter().map(|(b, k)| (b.as_str(), k.as_str())).unzip();
    sqlx::query(
        "UPDATE metadata_pack_sources s SET state = $3
         FROM UNNEST($1::text[], $2::text[]) AS t(b, k)
         WHERE s.bucket = t.b AND s.key = t.k",
    )
    .bind(buckets)
    .bind(keys)
    .bind(state)
    .execute(pg)
    .await?;
    Ok(())
}

/// Packed rows past the grace period whose match and kind the index serves, oldest first.
pub(crate) async fn due_deletions(
    pg: &PgPool,
    grace_s: u64,
    limit: usize,
) -> sqlx::Result<Vec<(String, String)>> {
    sqlx::query_as(
        "SELECT s.bucket, s.key FROM metadata_pack_sources s
         WHERE s.state = 1 AND s.packed_at < now() - make_interval(secs => $1)
           AND EXISTS (SELECT 1 FROM metadata_pack_entries e
                       WHERE e.match_id = s.match_id AND e.kind = s.kind)
         ORDER BY s.packed_at
         LIMIT $2",
    )
    .bind(f64::from(u32::try_from(grace_s).unwrap_or(u32::MAX)))
    .bind(i64::try_from(limit).unwrap_or(i64::MAX))
    .fetch_all(pg)
    .await
}

/// Logs and exports the queue's size per state every 30 minutes (a scan of the whole queue).
pub(crate) async fn stats_loop(ctx: Arc<Ctx>, shutdown: CancellationToken) {
    let mut tick = tokio::time::interval(core::time::Duration::from_mins(30));
    loop {
        tokio::select! {
            () = shutdown.cancelled() => return,
            _ = tick.tick() => {}
        }
        let rows: sqlx::Result<Vec<(String, i16, i64, i64)>> = sqlx::query_as(
            "SELECT bucket, state, count(*), coalesce(sum(size), 0)::bigint
             FROM metadata_pack_sources GROUP BY bucket, state ORDER BY bucket, state",
        )
        .fetch_all(ctx.pg())
        .await;
        match rows {
            Ok(rows) => {
                for (bucket, state, count, bytes) in rows {
                    info!("Queue {bucket} state {state}: {count} files, {bytes} bytes");
                    let state = state.to_string();
                    #[expect(clippy::cast_precision_loss, reason = "a gauge, approximate is fine")]
                    {
                        gauge!("metadata_packer.queue_files", "bucket" => bucket.clone(), "state" => state.clone())
                            .set(count as f64);
                        gauge!("metadata_packer.queue_bytes", "bucket" => bucket, "state" => state)
                            .set(bytes as f64);
                    }
                }
            }
            Err(e) => warn!("Could not count the queue: {e}"),
        }
    }
}
