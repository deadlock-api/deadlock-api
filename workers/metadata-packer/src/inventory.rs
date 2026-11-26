//! Lists a bucket's loose metadata files into the work queue.
//!
//! `object_store` lists by directory, not by key prefix, so a full listing is split into
//! lexicographic ranges with `list_with_offset`: one range per first two characters of the file
//! name. They run concurrently, which matters for the 50M-object archive bucket.

use std::sync::Arc;

use futures::{StreamExt as _, TryStreamExt as _};
use metadata_packs::format::{hex, parse_md5_etag};
use metadata_packs::{SOURCE_PREFIXES, parse_source_key};
use metrics::counter;
use object_store::path::Path;
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use crate::queue::{self, Listed};
use crate::{Bucket, Ctx, Error};

const BATCH: usize = 5000;
const SHARDS_IN_FLIGHT: usize = 16;

/// The name ranges of one prefix: `[bounds[i], bounds[i + 1])`, the last one open.
fn shard_bounds() -> Vec<String> {
    let mut bounds = vec![String::new()];
    for first in '0'..='9' {
        for second in core::iter::once('.').chain('0'..='9') {
            bounds.push(format!("{first}{second}"));
        }
    }
    bounds
}

/// The queue's `ETag`: the md5 in lower-case hex, or the raw value for multipart uploads.
fn etag_of(raw: Option<&str>) -> String {
    raw.map_or_else(String::new, |etag| {
        parse_md5_etag(etag).map_or_else(|| etag.trim_matches('"').to_owned(), |md5| hex(&md5))
    })
}

async fn list_shard(
    ctx: &Ctx,
    bucket: &Bucket,
    prefix: &str,
    start: &str,
    end: Option<&str>,
) -> Result<u64, Error> {
    let dir = Path::from(prefix.trim_end_matches('/'));
    let start_key = format!("{prefix}{start}");
    let end_key = end.map(|e| format!("{prefix}{e}"));
    let mut stream = if start.is_empty() {
        bucket.store.list(Some(&dir))
    } else {
        bucket
            .store
            .list_with_offset(Some(&dir), &Path::from(start_key.as_str()))
    };
    let mut batch = Vec::with_capacity(BATCH);
    let mut listed = 0u64;
    let mut skipped = 0u64;
    while let Some(meta) = stream.try_next().await? {
        let key = meta.location.as_ref();
        if end_key.as_deref().is_some_and(|end| key >= end) {
            break;
        }
        let Some((match_id, kind)) = parse_source_key(key) else {
            skipped = skipped.saturating_add(1);
            debug!("Skipping {key}");
            continue;
        };
        batch.push(Listed {
            key: key.to_owned(),
            match_id,
            kind,
            size: meta.size,
            etag: etag_of(meta.e_tag.as_deref()),
            last_modified_ms: meta.last_modified.timestamp_millis(),
        });
        if batch.len() >= BATCH {
            queue::upsert_listed(ctx.pg(), &bucket.name, &batch).await?;
            listed = listed.saturating_add(u64::try_from(batch.len()).unwrap_or_default());
            batch.clear();
        }
    }
    queue::upsert_listed(ctx.pg(), &bucket.name, &batch).await?;
    listed = listed.saturating_add(u64::try_from(batch.len()).unwrap_or_default());
    if skipped > 0 {
        warn!(
            "Skipped {skipped} unrecognized keys under {prefix}{start} in {}",
            bucket.name
        );
    }
    counter!("metadata_packer.listed", "bucket" => bucket.name.clone()).increment(listed);
    Ok(listed)
}

/// Lists every loose metadata file of `bucket` into the queue. Returns how many were listed.
pub(crate) async fn inventory(ctx: &Ctx, bucket: &Bucket) -> Result<u64, Error> {
    let bounds = shard_bounds();
    let mut shards = Vec::new();
    for prefix in SOURCE_PREFIXES {
        for (i, start) in bounds.iter().enumerate() {
            let end = bounds.get(i.saturating_add(1)).cloned();
            shards.push(((*prefix).to_owned(), start.clone(), end));
        }
    }
    let counts: Vec<u64> = futures::stream::iter(shards)
        .map(|(prefix, start, end)| async move {
            list_shard(ctx, bucket, &prefix, &start, end.as_deref()).await
        })
        .buffer_unordered(SHARDS_IN_FLIGHT)
        .try_collect()
        .await?;
    Ok(counts.into_iter().fold(0, u64::saturating_add))
}

/// Re-lists the main bucket every `inventory_interval`, so new files get packed.
pub(crate) async fn inventory_loop(ctx: Arc<Ctx>, shutdown: CancellationToken) {
    let mut tick = tokio::time::interval(ctx.cfg.inventory_interval);
    loop {
        tokio::select! {
            () = shutdown.cancelled() => return,
            _ = tick.tick() => {}
        }
        if !ctx.flag(queue::FLAG_PACK).await {
            continue;
        }
        match inventory(&ctx, &ctx.main).await {
            Ok(listed) => info!("Listed {listed} loose files in {}", ctx.main.name),
            Err(e) => warn!("Listing {} failed: {e}", ctx.main.name),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shards_cover_digit_names_in_order() {
        let bounds = shard_bounds();
        assert_eq!(bounds.len(), 111);
        assert!(bounds.windows(2).all(|w| w[0] < w[1]));
        assert_eq!(bounds[1], "0.");
        assert_eq!(bounds[2], "00");
        let name = "12345.meta.bz2";
        let shard = bounds.iter().rposition(|b| name >= b.as_str()).unwrap();
        assert_eq!(bounds[shard], "12");
    }

    #[test]
    fn etags() {
        assert_eq!(
            etag_of(Some("\"0123456789ABCDEF0123456789abcdef\"")),
            "0123456789abcdef0123456789abcdef"
        );
        assert_eq!(etag_of(Some("\"abc-2\"")), "abc-2");
        assert_eq!(etag_of(None), "");
    }
}
