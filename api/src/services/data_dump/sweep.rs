//! Stateless garbage collection: anything under the tables prefix that the published manifest
//! does not reference is deleted once the grace period has passed. For a file the manifest
//! retired (folded or replaced by compaction) the grace period counts from its retirement,
//! so readers of the previous manifest keep working; for an object that was never published
//! (left behind by a crashed run) it counts from its upload.

use core::time::Duration;
use std::collections::{BTreeMap, HashSet};
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
    retired: &BTreeMap<String, DateTime<Utc>>,
    grace: Duration,
) -> Result<usize, DumpError> {
    let cutoff =
        Utc::now() - chrono::Duration::from_std(grace).unwrap_or(chrono::Duration::hours(24));
    let stale: Vec<Path> = store
        .list(Some(&Path::from(prefix)))
        .try_filter_map(|meta| {
            let stale = is_stale(
                meta.location.as_ref(),
                meta.last_modified,
                referenced,
                retired,
                cutoff,
            );
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

fn is_stale(
    key: &str,
    last_modified: DateTime<Utc>,
    referenced: &HashSet<String>,
    retired: &BTreeMap<String, DateTime<Utc>>,
    cutoff: DateTime<Utc>,
) -> bool {
    !referenced.contains(key) && retired.get(key).copied().unwrap_or(last_modified) < cutoff
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_old_file_retired_just_now_is_kept() {
        let now = Utc::now();
        let cutoff = now - chrono::Duration::hours(24);
        let built = now - chrono::Duration::days(3);
        let retired = BTreeMap::from([("old".to_owned(), now)]);
        assert!(!is_stale("old", built, &HashSet::new(), &retired, cutoff));

        let retired = BTreeMap::from([("old".to_owned(), now - chrono::Duration::hours(25))]);
        assert!(is_stale("old", built, &HashSet::new(), &retired, cutoff));
    }

    #[test]
    fn unpublished_objects_age_from_their_upload() {
        let now = Utc::now();
        let cutoff = now - chrono::Duration::hours(24);
        let none = BTreeMap::new();
        assert!(!is_stale("orphan", now, &HashSet::new(), &none, cutoff));
        let old = now - chrono::Duration::days(2);
        assert!(is_stale("orphan", old, &HashSet::new(), &none, cutoff));
        let referenced = HashSet::from(["orphan".to_owned()]);
        assert!(!is_stale("orphan", old, &referenced, &none, cutoff));
    }
}
