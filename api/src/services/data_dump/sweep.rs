//! Stateless garbage collection, run at the start of a tick against the manifest the
//! previous tick published: anything under a prefix that manifest does not reference and
//! that was uploaded before it was published is deleted. That is every file the publish
//! dropped (folded or replaced by compaction) and every object a crashed run left behind,
//! but never an upload of a run still in flight. A dropped file therefore outlives its
//! manifest by less than one tick, so readers of the previous manifest keep working.

use std::collections::HashSet;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use futures::{StreamExt, TryStreamExt};
use object_store::ObjectStore;
use object_store::path::Path;
use tracing::info;

use super::DumpError;

pub(crate) async fn sweep(
    store: &Arc<dyn ObjectStore>,
    prefix: &str,
    referenced: &HashSet<String>,
    published_at: DateTime<Utc>,
) -> Result<usize, DumpError> {
    let stale: Vec<Path> = store
        .list(Some(&Path::from(prefix)))
        .try_filter_map(|meta| {
            let stale = is_stale(
                meta.location.as_ref(),
                meta.last_modified,
                referenced,
                published_at,
            );
            async move { Ok(stale.then_some(meta.location)) }
        })
        .try_collect()
        .await?;
    if stale.is_empty() {
        return Ok(0);
    }
    let deleted = store
        .delete_stream(futures::stream::iter(stale).map(Ok).boxed())
        .try_collect::<Vec<_>>()
        .await?
        .len();
    info!(deleted, "data dump swept unreferenced objects");
    Ok(deleted)
}

fn is_stale(
    key: &str,
    last_modified: DateTime<Utc>,
    referenced: &HashSet<String>,
    published_at: DateTime<Utc>,
) -> bool {
    !referenced.contains(key) && last_modified < published_at
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unreferenced_objects_older_than_the_publish_go() {
        let published_at = Utc::now();
        let before = published_at - chrono::Duration::minutes(5);
        assert!(is_stale("old", before, &HashSet::new(), published_at));
        let referenced = HashSet::from(["old".to_owned()]);
        assert!(!is_stale("old", before, &referenced, published_at));
    }

    #[test]
    fn uploads_after_the_publish_are_kept() {
        let published_at = Utc::now();
        let after = published_at + chrono::Duration::minutes(5);
        assert!(!is_stale("in-flight", after, &HashSet::new(), published_at));
    }
}
