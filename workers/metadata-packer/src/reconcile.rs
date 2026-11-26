//! Keeps the index in step with the bucket, which is the source of truth: every sidecar the
//! index lacks is published (a crash between the sidecar PUT and the commit, or a lost database),
//! and a pack without a sidecar a day after its upload is deleted (an upload that never
//! committed). With `all`, every sidecar is published again: a rebuild from S3 alone.

use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use chrono_free::older_than;
use futures::TryStreamExt as _;
use metadata_packs::PublishSources;
use metadata_packs::format::{self, decode_sidecar};
use metrics::counter;
use object_store::ObjectStoreExt as _;
use object_store::path::Path;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use crate::{Ctx, Error, PACK_BUCKET};

/// An uncommitted pack is garbage once its upload is this old.
const ORPHAN_AGE_S: i64 = 24 * 60 * 60;

#[derive(Debug, Default)]
pub(crate) struct Stats {
    pub(crate) sidecars: usize,
    pub(crate) published: usize,
    pub(crate) orphans_deleted: usize,
    pub(crate) invalid: usize,
}

mod chrono_free {
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Whether a unix timestamp in milliseconds is more than `age_s` seconds ago.
    pub(super) fn older_than(timestamp_ms: i64, age_s: i64) -> bool {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or_default(|d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX));
        now_ms.saturating_sub(timestamp_ms) > age_s.saturating_mul(1000)
    }
}

#[derive(Debug, Default)]
struct Objects {
    pack_modified_ms: Option<i64>,
    sidecar: bool,
}

pub(crate) async fn reconcile(ctx: &Ctx, all: bool) -> Result<Stats, Error> {
    let store = &ctx.packs.store;
    let prefix = ctx.cfg.prefix.as_str();
    let mut objects: BTreeMap<u64, Objects> = BTreeMap::new();
    let mut listing = store.list(Some(&Path::from(prefix)));
    while let Some(meta) = listing.try_next().await? {
        let Some((id, is_sidecar)) = format::parse_pack_key(prefix, meta.location.as_ref()) else {
            continue;
        };
        let entry = objects.entry(id).or_default();
        if is_sidecar {
            entry.sidecar = true;
        } else {
            entry.pack_modified_ms = Some(meta.last_modified.timestamp_millis());
        }
    }
    let known: HashSet<u64> = if all {
        HashSet::new()
    } else {
        ctx.index.pack_ids().await?.into_iter().collect()
    };
    let mut stats = Stats::default();
    for (id, objs) in objects {
        if objs.sidecar {
            stats.sidecars = stats.sidecars.saturating_add(1);
            if known.contains(&id) {
                continue;
            }
            ctx.limiter.acquire().await;
            let data = store
                .get(&format::sidecar_key(prefix, id))
                .await?
                .bytes()
                .await?;
            match decode_sidecar(&data) {
                Ok((header, entries)) if header.pack_id == id => {
                    ctx.index
                        .publish(PACK_BUCKET, &header, &entries, PublishSources::ByMd5)
                        .await?;
                    stats.published = stats.published.saturating_add(1);
                    counter!("metadata_packer.adopted").increment(1);
                }
                Ok((header, _)) => {
                    stats.invalid = stats.invalid.saturating_add(1);
                    warn!("Sidecar {id} names pack {}, skipping it", header.pack_id);
                }
                Err(e) => {
                    stats.invalid = stats.invalid.saturating_add(1);
                    warn!("Sidecar {id} is invalid, skipping it: {e}");
                }
            }
        } else if let Some(modified) = objs.pack_modified_ms
            && older_than(modified, ORPHAN_AGE_S)
            && !known.contains(&id)
        {
            ctx.limiter.acquire().await;
            store.delete(&format::pack_key(prefix, id)).await?;
            stats.orphans_deleted = stats.orphans_deleted.saturating_add(1);
            warn!("Deleted pack {id}: uploaded more than a day ago and never committed");
        }
    }
    Ok(stats)
}

pub(crate) async fn reconcile_loop(ctx: Arc<Ctx>, shutdown: CancellationToken) {
    let mut tick = tokio::time::interval(core::time::Duration::from_mins(15));
    loop {
        tokio::select! {
            () = shutdown.cancelled() => return,
            _ = tick.tick() => {}
        }
        match reconcile(&ctx, false).await {
            Ok(stats) if stats.published > 0 || stats.orphans_deleted > 0 || stats.invalid > 0 => {
                info!("Reconciled the index with the bucket: {stats:?}");
            }
            Ok(_) => {}
            Err(e) => warn!("Reconciling the index failed: {e}"),
        }
    }
}
