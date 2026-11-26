//! Plans packs from the queue and builds them.
//!
//! The planner walks the pending rows in `match_id` order and cuts a pack at
//! `target_bytes` or `max_files`, never between two files of the same match. A smaller tail is
//! sealed only once its oldest row waited `seal_after`, so new files collect into full packs.
//! Rows of jobs still running are never planned twice: the planner waits for every job before
//! it starts over at match id 0.
//!
//! A job fetches its files (checking each against its `ETag`), builds the pack, uploads it and
//! reads it back (`metadata_packs::upload_pack`), and publishes it to the index together with the
//! queue rows it covers. Any failure leaves the rows pending for the next sweep.

use core::time::Duration;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use bytes::Bytes;
use futures::StreamExt as _;
use metadata_packs::format::{hex, parse_md5_etag};
use metadata_packs::{Kind, PublishSources, SourceFile, Verify, build_pack, upload_pack};
use metrics::counter;
use object_store::ObjectStoreExt as _;
use object_store::path::Path;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use crate::dm;
use crate::queue::{self, Pending};
use crate::{Ctx, PACK_BUCKET};

const FETCH_ATTEMPTS: u32 = 3;

/// The rows of one pack and whether the planner reached the end of the queue.
#[derive(Debug)]
struct Plan {
    rows: Vec<Pending>,
    bytes: u64,
    reached_end: bool,
}

/// Takes whole matches off the front of `rows` until the pack is full. `fetched_all` says the
/// query returned fewer rows than it asked for, so nothing comes after `rows`.
fn plan(rows: Vec<Pending>, target_bytes: u64, max_files: usize, fetched_all: bool) -> Plan {
    let mut taken = Vec::new();
    let mut bytes = 0u64;
    let mut iter = rows.into_iter().peekable();
    while let Some(row) = iter.next() {
        let match_id = row.match_id;
        bytes = bytes.saturating_add(row.size);
        taken.push(row);
        let next_same_match = iter.peek().is_some_and(|next| next.match_id == match_id);
        if !next_same_match && (bytes >= target_bytes || taken.len() >= max_files) {
            break;
        }
    }
    let reached_end = fetched_all && iter.peek().is_none();
    Plan {
        rows: taken,
        bytes,
        reached_end,
    }
}

pub(crate) async fn pack_loop(ctx: Arc<Ctx>, shutdown: CancellationToken) {
    let mut cursor = 0u64;
    let mut jobs: JoinSet<()> = JoinSet::new();
    let mut packed_this_sweep = false;
    loop {
        if shutdown.is_cancelled() {
            break;
        }
        if !ctx.flag(queue::FLAG_PACK).await {
            while jobs.join_next().await.is_some() {}
            pause(&shutdown, Duration::from_secs(30)).await;
            continue;
        }
        while jobs.len() >= ctx.cfg.jobs.max(1) {
            jobs.join_next().await;
        }
        // One file more than a pack can hold tells whether the queue goes on.
        let limit = ctx.cfg.max_files.saturating_add(1);
        let rows = match queue::pending_from(ctx.pg(), cursor, limit).await {
            Ok(rows) => rows,
            Err(e) => {
                warn!("Could not read the queue: {e}");
                pause(&shutdown, Duration::from_secs(10)).await;
                continue;
            }
        };
        let fetched_all = rows.len() < limit;
        let plan = plan(rows, ctx.cfg.target_bytes, ctx.cfg.max_files, fetched_all);
        let seal_after = i64::try_from(ctx.cfg.seal_after.as_secs()).unwrap_or(i64::MAX);
        let tail_waited = plan.rows.iter().map(|r| r.age_s).max().unwrap_or_default() >= seal_after;
        let full = plan.bytes >= ctx.cfg.target_bytes || plan.rows.len() >= ctx.cfg.max_files;
        if plan.rows.is_empty() || (plan.reached_end && !full && !tail_waited) {
            // The end of a sweep: let the running jobs finish before starting over at 0.
            while jobs.join_next().await.is_some() {}
            cursor = 0;
            if !packed_this_sweep {
                pause(&shutdown, Duration::from_mins(1)).await;
            }
            packed_this_sweep = false;
            continue;
        }
        cursor = plan
            .rows
            .last()
            .map_or(cursor, |r| r.match_id.saturating_add(1));
        packed_this_sweep = true;
        let job_ctx = Arc::clone(&ctx);
        jobs.spawn(async move {
            let started = Instant::now();
            match run_job(&job_ctx, plan.rows).await {
                Ok(Some(summary)) => info!("{summary} in {:.1?}", started.elapsed()),
                Ok(None) => {}
                Err(e) => {
                    counter!("metadata_packer.job_failures").increment(1);
                    warn!("Pack job failed, its files stay pending: {e}");
                }
            }
        });
    }
    info!("Waiting for {} pack jobs to finish", jobs.len());
    while jobs.join_next().await.is_some() {}
}

async fn pause(shutdown: &CancellationToken, duration: Duration) {
    tokio::select! {
        () = shutdown.cancelled() => {}
        () = tokio::time::sleep(duration) => {}
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum JobError {
    #[error(transparent)]
    Sql(#[from] sqlx::Error),
    #[error(transparent)]
    Pack(#[from] metadata_packs::PackError),
    #[error("building the pack panicked or was cancelled")]
    Join,
    #[error("staging the damage matrix: {0}")]
    Dm(#[from] clickhouse::error::Error),
}

/// What became of one queue row in a job.
enum Outcome {
    Fetched(SourceFile),
    Vanished,
    Failed,
}

/// The rows of one `(match_id, kind)`: the newest is packed, older copies with the same bytes
/// are covered by it, copies with other bytes are kept as conflicts.
struct Group {
    representative: Pending,
    same: Vec<Pending>,
    conflicts: Vec<Pending>,
}

fn group(rows: Vec<Pending>, main_bucket: &str) -> Vec<Group> {
    let mut by_file: BTreeMap<(u64, Kind), Vec<Pending>> = BTreeMap::new();
    for row in rows {
        by_file
            .entry((row.match_id, row.kind))
            .or_default()
            .push(row);
    }
    by_file
        .into_values()
        .filter_map(|mut rows| {
            // Newest last; on a tie, the main bucket's copy wins.
            rows.sort_by_key(|r| (r.last_modified_ms, r.bucket == main_bucket));
            let representative = rows.pop()?;
            let (same, conflicts) = rows
                .into_iter()
                .partition(|r| r.etag == representative.etag);
            Some(Group {
                representative,
                same,
                conflicts,
            })
        })
        .collect()
}

fn key_of(row: &Pending) -> (String, String) {
    (row.bucket.clone(), row.key.clone())
}

async fn fetch(ctx: &Ctx, row: &Pending) -> Outcome {
    let Some(bucket) = ctx.bucket(&row.bucket) else {
        warn!("Queue row for unknown bucket {}", row.bucket);
        return Outcome::Failed;
    };
    let expected = parse_md5_etag(&row.etag);
    let path = Path::from(row.key.as_str());
    for attempt in 1..=FETCH_ATTEMPTS {
        ctx.limiter.acquire().await;
        let data: Bytes = match async { bucket.store.get(&path).await?.bytes().await }.await {
            Ok(data) => data,
            Err(object_store::Error::NotFound { .. }) => return Outcome::Vanished,
            Err(e) => {
                counter!("metadata_packer.fetch_errors", "reason" => "store").increment(1);
                warn!(
                    "GET {} from {} failed (attempt {attempt}): {e}",
                    row.key, row.bucket
                );
                continue;
            }
        };
        let file = SourceFile::new(row.match_id, row.kind, data);
        if expected.is_some_and(|md5| md5 != file.md5) {
            counter!("metadata_packer.fetch_errors", "reason" => "md5").increment(1);
            warn!(
                "{} in {} has md5 {}, its ETag says {} (attempt {attempt})",
                row.key,
                row.bucket,
                hex(&file.md5),
                row.etag
            );
            continue;
        }
        return Outcome::Fetched(file);
    }
    Outcome::Failed
}

/// Builds, uploads and publishes one pack. `None` when none of the files could be fetched.
async fn run_job(ctx: &Ctx, rows: Vec<Pending>) -> Result<Option<String>, JobError> {
    let groups = group(rows, &ctx.main.name);
    let outcomes: Vec<(Group, Outcome)> = futures::stream::iter(groups)
        .map(|g| async move {
            let outcome = fetch(ctx, &g.representative).await;
            (g, outcome)
        })
        .buffer_unordered(ctx.cfg.fetch_concurrency.max(1))
        .collect()
        .await;

    let mut files = Vec::new();
    let mut covered = Vec::new();
    let mut conflicts = Vec::new();
    let mut vanished = Vec::new();
    let mut failed = 0usize;
    for (g, outcome) in outcomes {
        conflicts.extend(g.conflicts.iter().map(key_of));
        match outcome {
            Outcome::Fetched(file) => {
                files.push(file);
                covered.push(key_of(&g.representative));
                covered.extend(g.same.iter().map(key_of));
            }
            Outcome::Vanished => vanished.push(key_of(&g.representative)),
            Outcome::Failed => failed = failed.saturating_add(1),
        }
    }
    queue::set_state(ctx.pg(), &vanished, queue::VANISHED).await?;
    queue::set_state(ctx.pg(), &conflicts, queue::CONFLICT).await?;
    counter!("metadata_packer.vanished")
        .increment(u64::try_from(vanished.len()).unwrap_or_default());
    counter!("metadata_packer.conflicts")
        .increment(u64::try_from(conflicts.len()).unwrap_or_default());
    if files.is_empty() {
        return Ok(None);
    }

    // The damage matrix rows go in first: a failed insert fails the job, so no pack is
    // published without them (see `dm`).
    let staged = if let Some(ch) = &ctx.ch {
        let inputs = files
            .iter()
            .map(|f| (f.match_id, f.kind, f.data.clone()))
            .collect();
        let staged = dm::build(inputs, ctx.cfg.dm_threads).await;
        dm::insert(ch, &staged.rows).await?;
        Some(staged)
    } else {
        None
    };

    let pack_id = ctx.index.next_pack_id().await?;
    let created_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or_default(|d| d.as_secs());
    let pack = tokio::task::spawn_blocking(move || build_pack(pack_id, files, created_unix))
        .await
        .map_err(|_join| JobError::Join)??;
    // The multipart ETag proves the bucket stored what was sent; every so often a pack is also
    // downloaded whole, which costs a pack's worth of the host's 1 Gbit/s.
    let mode = if pack_id.is_multiple_of(ctx.cfg.read_back_every.max(1)) {
        Verify::ReadBack
    } else {
        Verify::ETag
    };
    upload_pack(ctx.packs.store.as_ref(), &ctx.cfg.prefix, &pack, mode).await?;
    ctx.index
        .publish(
            PACK_BUCKET,
            &pack.header,
            &pack.entries,
            PublishSources::Keys(&covered),
        )
        .await?;
    if let Some(staged) = &staged {
        dm::mark_done(ctx.pg(), pack_id, staged).await?;
    }

    let files = pack.entries.len();
    counter!("metadata_packer.packs").increment(1);
    counter!("metadata_packer.files").increment(u64::try_from(files).unwrap_or_default());
    counter!("metadata_packer.bytes").increment(pack.header.pack_len);
    let first = pack.entries.first().map_or_default(|e| e.match_id);
    let last = pack.entries.last().map_or_default(|e| e.match_id);
    Ok(Some(format!(
        "Published pack {pack_id}: {files} files ({} more covered, {} vanished, {} conflicts, \
         {failed} failed), {} MiB, matches {first}..={last}",
        covered.len().saturating_sub(files),
        vanished.len(),
        conflicts.len(),
        pack.header.pack_len / (1024 * 1024),
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(
        bucket: &str,
        match_id: u64,
        kind: Kind,
        size: u64,
        etag: &str,
        modified: i64,
    ) -> Pending {
        Pending {
            bucket: bucket.to_owned(),
            key: format!("processed/metadata/{match_id}-{kind:?}-{bucket}"),
            match_id,
            kind,
            size,
            etag: etag.to_owned(),
            last_modified_ms: modified,
            age_s: 0,
        }
    }

    #[test]
    fn plans_whole_matches_up_to_the_target() {
        let rows = vec![
            row("a", 1, Kind::Salt, 40, "x", 0),
            row("a", 2, Kind::Salt, 40, "x", 0),
            row("a", 2, Kind::Hltv, 40, "x", 0),
            row("a", 3, Kind::Salt, 40, "x", 0),
        ];
        let p = plan(rows.clone(), 100, 10, true);
        // Match 2's second file goes with its first even past the target.
        assert_eq!(p.rows.len(), 3);
        assert_eq!(p.bytes, 120);
        assert!(!p.reached_end);

        let p = plan(rows.clone(), 1000, 10, true);
        assert_eq!(p.rows.len(), 4);
        assert!(p.reached_end);

        let p = plan(rows.clone(), 1000, 10, false);
        assert!(!p.reached_end);

        let p = plan(rows, 1000, 1, true);
        assert_eq!(p.rows.len(), 1);
    }

    #[test]
    fn groups_keep_the_newest_and_flag_conflicts() {
        let groups = group(
            vec![
                row("old", 1, Kind::Salt, 1, "aa", 10),
                row("main", 1, Kind::Salt, 1, "aa", 20),
                row("old", 1, Kind::Hltv, 1, "bb", 30),
                row("main", 1, Kind::Hltv, 1, "cc", 20),
                row("old", 2, Kind::Salt, 1, "dd", 5),
                row("main", 2, Kind::Salt, 1, "dd", 5),
            ],
            "main",
        );
        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].representative.bucket, "main");
        assert_eq!(groups[0].same.len(), 1);
        assert!(groups[0].conflicts.is_empty());
        // The newer hltv copy wins, the other bytes are a conflict.
        assert_eq!(groups[1].representative.etag, "bb");
        assert_eq!(groups[1].conflicts.len(), 1);
        // A tie goes to the main bucket.
        assert_eq!(groups[2].representative.bucket, "main");
    }
}
