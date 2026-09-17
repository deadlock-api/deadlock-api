//! Stateless garbage collection: anything under the tables prefix that the published manifest
//! does not reference and that is older than the grace period is deleted. This covers files
//! folded or replaced by compaction as well as objects left behind by a crashed run.

use core::time::Duration;
use std::collections::HashSet;
use std::sync::Arc;

use chrono::Utc;
use futures::{StreamExt, TryStreamExt};
use object_store::ObjectStore;
use object_store::path::Path;
use tracing::info;

use super::DumpError;

pub(crate) async fn sweep(
    store: &Arc<dyn ObjectStore>,
    prefix: &str,
    referenced: &HashSet<String>,
    grace: Duration,
) -> Result<usize, DumpError> {
    let cutoff =
        Utc::now() - chrono::Duration::from_std(grace).unwrap_or(chrono::Duration::hours(24));
    let stale: Vec<Path> = store
        .list(Some(&Path::from(prefix)))
        .try_filter_map(|meta| {
            let stale = meta.last_modified < cutoff && !referenced.contains(meta.location.as_ref());
            async move { Ok(stale.then_some(meta.location)) }
        })
        .try_collect()
        .await?;
    if stale.is_empty() {
        return Ok(0);
    }
    let deleted = store
        .delete_stream(futures::stream::iter(stale.clone()).map(Ok).boxed())
        .try_collect::<Vec<_>>()
        .await?
        .len();
    info!(deleted, "data dump swept unreferenced objects");
    Ok(deleted)
}
