//! In-process job queue + background worker for demo query extraction.
//!
//! Single instance: a bounded `mpsc` channel feeds a dispatcher that runs jobs under
//! a small `Semaphore` (these jobs saturate every core via rayon and hold the whole
//! demo in memory). Job status lives in Redis; the result artifact is uploaded to the
//! public `demo-extracts` R2 bucket.

use core::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use object_store::aws::AmazonS3;
use object_store::path::Path;
use object_store::{ObjectStoreExt, WriteMultipart};
use redis::aio::MultiplexedConnection;
use tokio::sync::{Semaphore, mpsc};
use tracing::{error, info};

use super::format::ArtifactStream;
use super::job::{JobRecord, JobStatus, store as store_job};
use super::{OutputFormat, download, format};
use crate::error::APIResult;
use crate::utils::compression::is_zstd;

/// Max jobs waiting in the channel before submits get a 429.
const MAX_QUEUE_DEPTH: usize = 32;
/// Concurrent jobs. Each one uses all cores via rayon and holds the full demo in
/// memory, so keep this tiny. Bump only after measuring headroom.
pub(super) const MAX_CONCURRENT: usize = 2;
/// Rough per-job duration used purely for the status endpoint's wait estimate.
pub(super) const AVG_JOB_SECONDS: u64 = 55;
/// Multipart part size. A whole-artifact `put` cannot finish inside the `object_store`
/// 30s request timeout once an extract reaches a few hundred MB (NDJSON routinely does),
/// so parts are sized to upload well inside that budget and to be retried individually.
const UPLOAD_CHUNK_SIZE: usize = 16 * 1024 * 1024;
/// Parts in flight per job. Jobs already run [`MAX_CONCURRENT`]-wide, so keep this low.
const UPLOAD_CONCURRENCY: usize = 4;

pub(crate) struct QueryJob {
    pub(crate) job_id: String,
    pub(crate) match_id: u64,
    pub(crate) demo_url: String,
    pub(crate) sql: String,
    pub(crate) format: OutputFormat,
    pub(crate) enqueued_at: i64,
    /// Set by [`QuerySlot::send`].
    pub(crate) queue_ticket: u64,
}

#[derive(Clone)]
pub(crate) struct DemoQueryQueue {
    tx: mpsc::Sender<QueryJob>,
    ticket: Arc<AtomicU64>,
    completed: Arc<AtomicU64>,
}

impl DemoQueryQueue {
    pub(crate) fn spawn(redis: MultiplexedConnection, r2: AmazonS3, public_url: &str) -> Self {
        let (tx, mut rx) = mpsc::channel::<QueryJob>(MAX_QUEUE_DEPTH);
        let completed = Arc::new(AtomicU64::new(0));
        let public_url = Arc::<str>::from(public_url.trim_end_matches('/').to_owned());

        let completed_worker = completed.clone();
        tokio::spawn(async move {
            let sem = Arc::new(Semaphore::new(MAX_CONCURRENT));
            while let Some(job) = rx.recv().await {
                if crate::SHUTTING_DOWN.load(Ordering::Relaxed) {
                    break;
                }
                let Ok(permit) = sem.clone().acquire_owned().await else {
                    break;
                };
                let redis = redis.clone();
                let r2 = r2.clone();
                let public_url = public_url.clone();
                let completed = completed_worker.clone();
                tokio::spawn(async move {
                    let _permit = permit;
                    run_job(redis, &r2, &public_url, job).await;
                    completed.fetch_add(1, Ordering::Relaxed);
                });
            }
        });

        Self {
            tx,
            ticket: Arc::new(AtomicU64::new(0)),
            completed,
        }
    }

    /// Reserve a queue slot, returning `None` when the queue is full. The caller must
    /// persist the `queued` job record (using [`QuerySlot::ticket`]) *before* calling
    /// [`QuerySlot::send`], so the record always exists before the worker can see the job.
    pub(crate) fn reserve(&self) -> Option<QuerySlot> {
        let permit = self.tx.clone().try_reserve_owned().ok()?;
        let ticket = self.ticket.fetch_add(1, Ordering::Relaxed);
        Some(QuerySlot { permit, ticket })
    }

    /// Number of jobs that have finished processing, for wait estimation.
    pub(crate) fn completed(&self) -> u64 {
        self.completed.load(Ordering::Relaxed)
    }
}

/// A reserved queue slot. Holds capacity so the `queued` record can be written before
/// the job is released to the worker.
pub(crate) struct QuerySlot {
    permit: mpsc::OwnedPermit<QueryJob>,
    pub(crate) ticket: u64,
}

impl QuerySlot {
    pub(crate) fn send(self, mut job: QueryJob) {
        job.queue_ticket = self.ticket;
        self.permit.send(job);
    }
}

async fn run_job(mut redis: MultiplexedConnection, r2: &AmazonS3, public_url: &str, job: QueryJob) {
    info!(
        job_id = %job.job_id,
        match_id = job.match_id,
        format = job.format.extension(),
        query = %job.sql,
        "Running demo query job"
    );

    let running_since = chrono::Utc::now().timestamp();
    let mut record = JobRecord {
        status: JobStatus::Running,
        match_id: job.match_id,
        format: job.format,
        queue_ticket: job.queue_ticket,
        enqueued_at: job.enqueued_at,
        running_since: Some(running_since),
        completed_at: None,
        result_url: None,
        error: None,
    };
    if let Err(e) = store_job(&mut redis, &job.job_id, &record).await {
        error!("Failed to mark demo query job {} running: {e}", job.job_id);
        return;
    }

    let started = Instant::now();
    let mut timings = PhaseTimings::default();
    match process(r2, public_url, &job, &mut timings).await {
        Ok(result_url) => {
            record.status = JobStatus::Done;
            record.result_url = Some(result_url);
        }
        Err(e) => {
            record.status = JobStatus::Failed;
            record.error = Some(e.to_string());
        }
    }

    let completed_at = chrono::Utc::now().timestamp();
    record.completed_at = Some(completed_at);
    info!(
        job_id = %job.job_id,
        match_id = job.match_id,
        format = job.format.extension(),
        status = ?record.status,
        duration_secs = completed_at.saturating_sub(running_since),
        duration_ms = millis(started),
        queue_wait_secs = running_since.saturating_sub(job.enqueued_at),
        phase = timings.phase,
        download_ms = timings.download_ms,
        compressed_bytes = timings.compressed_bytes,
        demo_compression = timings.demo_compression,
        decompress_ms = timings.decompress_ms,
        demo_bytes = timings.demo_bytes,
        parse_ms = timings.parse_ms,
        query_ms = timings.query_ms,
        upload_wait_ms = timings.upload_wait_ms,
        upload_tail_ms = timings.upload_tail_ms,
        artifact_bytes = timings.artifact_bytes,
        upload_parts = timings.upload_parts,
        error = record.error.as_deref(),
        "Finished demo query job"
    );

    if let Err(e) = store_job(&mut redis, &job.job_id, &record).await {
        error!("Failed to store demo query job {} result: {e}", job.job_id);
    }
}

/// Per-phase wall time and sizes of one job, logged on `Finished demo query job` so job
/// duration can be broken down from the logs. Serialization and upload overlap, so
/// `query_ms` includes any time the pipeline was throttled by the upload (`upload_wait_ms`),
/// and only `upload_tail_ms` is upload time spent after the last chunk was produced.
#[derive(Default)]
struct PhaseTimings {
    /// Phase the job was in when it ended; for a failed job, the phase that failed.
    phase: &'static str,
    download_ms: u64,
    compressed_bytes: u64,
    demo_compression: &'static str,
    decompress_ms: u64,
    demo_bytes: u64,
    /// Schema discovery, full demo parse and query planning (`demofusion::query`).
    parse_ms: u64,
    /// SQL execution and serialization, until the last artifact chunk is produced.
    query_ms: u64,
    /// Time spent blocked waiting for in-flight upload parts to drain.
    upload_wait_ms: u64,
    /// Completing the multipart upload after the last chunk.
    upload_tail_ms: u64,
    artifact_bytes: u64,
    upload_parts: u64,
}

fn millis(since: Instant) -> u64 {
    u64::try_from(since.elapsed().as_millis()).unwrap_or(u64::MAX)
}

async fn process(
    r2: &AmazonS3,
    public_url: &str,
    job: &QueryJob,
    timings: &mut PhaseTimings,
) -> APIResult<String> {
    timings.phase = "download";
    let t = Instant::now();
    let compressed = download::download_demo(&job.demo_url).await?;
    timings.download_ms = millis(t);
    timings.compressed_bytes = compressed.len() as u64;
    timings.demo_compression = if is_zstd(&compressed) {
        "zstd"
    } else {
        "bzip2"
    };

    timings.phase = "decompress";
    let t = Instant::now();
    let demo = format::decompress(compressed).await?;
    timings.decompress_ms = millis(t);
    timings.demo_bytes = demo.len() as u64;

    timings.phase = "parse";
    let t = Instant::now();
    let artifact = format::run_and_stream(demo, &job.sql, job.format, UPLOAD_CHUNK_SIZE).await?;
    timings.parse_ms = millis(t);

    let object_key = format!("{}.{}", job.job_id, job.format.object_extension());
    upload(r2, &object_key, artifact, timings).await?;

    timings.phase = "done";
    Ok(format!("{public_url}/{object_key}"))
}

/// Upload the artifact as a multipart as it is serialized, applying backpressure so at most
/// [`UPLOAD_CONCURRENCY`] parts are in flight. On failure the multipart is aborted so R2
/// does not retain orphaned parts.
async fn upload(
    r2: &AmazonS3,
    object_key: &str,
    mut artifact: ArtifactStream,
    timings: &mut PhaseTimings,
) -> APIResult<()> {
    timings.phase = "query";
    let started = Instant::now();
    let upload = r2.put_multipart(&Path::from(object_key)).await?;
    let mut writer = WriteMultipart::new_with_chunk_size(upload, UPLOAD_CHUNK_SIZE);

    while let Some(chunk) = artifact.chunks.recv().await {
        let t = Instant::now();
        if let Err(e) = writer.wait_for_capacity(UPLOAD_CONCURRENCY).await {
            timings.phase = "upload";
            let _ = writer.abort().await;
            return Err(e.into());
        }
        timings.upload_wait_ms += millis(t);
        timings.artifact_bytes += chunk.len() as u64;
        timings.upload_parts += 1;
        writer.put(chunk);
    }

    // The chunk channel also closes when the query or serializer fails partway through, which
    // would otherwise commit a truncated artifact as if it were complete.
    if let Err(e) = artifact.finish().await {
        let _ = writer.abort().await;
        return Err(e);
    }
    timings.query_ms = millis(started);

    timings.phase = "upload";
    let t = Instant::now();
    writer.finish().await?;
    timings.upload_tail_ms = millis(t);
    Ok(())
}
