//! Deletes loose files whose pack was published at least `delete_grace` ago, behind the
//! `metadata_packer_delete` flag. A row is deleted only while the index still has an entry for
//! its match and kind (`queue::due_deletions`), so every deleted file stays readable.

use std::collections::BTreeMap;
use std::sync::Arc;

use futures::StreamExt as _;
use metrics::counter;
use object_store::path::Path;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use crate::{Ctx, queue};

const BATCH: usize = 5000;
/// Keys per `DeleteObjects` request.
const KEYS_PER_REQUEST: usize = 1000;

pub(crate) async fn delete_loop(ctx: Arc<Ctx>, shutdown: CancellationToken) {
    let mut tick = tokio::time::interval(core::time::Duration::from_secs(20));
    loop {
        tokio::select! {
            () = shutdown.cancelled() => return,
            _ = tick.tick() => {}
        }
        if !ctx.flag(queue::FLAG_DELETE).await {
            continue;
        }
        loop {
            match delete_batch(&ctx).await {
                Ok(0) => break,
                Ok(deleted) => info!("Deleted {deleted} packed loose files"),
                Err(e) => {
                    warn!("Deleting packed files failed: {e}");
                    break;
                }
            }
            if shutdown.is_cancelled() || !ctx.flag(queue::FLAG_DELETE).await {
                break;
            }
        }
    }
}

async fn delete_batch(ctx: &Ctx) -> Result<usize, sqlx::Error> {
    let due = queue::due_deletions(ctx.pg(), ctx.cfg.delete_grace.as_secs(), BATCH).await?;
    if due.is_empty() {
        return Ok(0);
    }
    let mut by_bucket: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (bucket, key) in due {
        by_bucket.entry(bucket).or_default().push(key);
    }
    let mut deleted = Vec::new();
    for (bucket_name, keys) in by_bucket {
        let Some(bucket) = ctx.bucket(&bucket_name) else {
            warn!("Packed rows in unknown bucket {bucket_name}");
            continue;
        };
        for chunk in keys.chunks(KEYS_PER_REQUEST) {
            ctx.limiter.acquire().await;
            let paths: Vec<_> = chunk.iter().map(|k| Ok(Path::from(k.as_str()))).collect();
            let paths = futures::stream::iter(paths).boxed();
            let results: Vec<_> = bucket.store.delete_stream(paths).collect().await;
            for result in results {
                match result {
                    Ok(path) => deleted.push((bucket_name.clone(), path.to_string())),
                    Err(object_store::Error::NotFound { path, .. }) => {
                        deleted.push((bucket_name.clone(), path));
                    }
                    Err(e) => {
                        counter!("metadata_packer.delete_errors").increment(1);
                        warn!("A delete in {bucket_name} failed: {e}");
                    }
                }
            }
        }
    }
    queue::set_state(ctx.pg(), &deleted, queue::DELETED).await?;
    counter!("metadata_packer.deleted").increment(u64::try_from(deleted.len()).unwrap_or_default());
    Ok(deleted.len())
}
