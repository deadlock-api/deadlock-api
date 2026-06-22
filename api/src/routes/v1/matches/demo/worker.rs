//! In-process job queue + background worker for demo query extraction.
//!
//! Single instance: a bounded `mpsc` channel feeds a dispatcher that runs jobs under
//! a small `Semaphore` (these jobs saturate every core via rayon and hold the whole
//! demo in memory). Job status lives in Redis; the result artifact is uploaded to the
//! public `demo-extracts` R2 bucket.

use core::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use object_store::ObjectStoreExt;
use object_store::aws::AmazonS3;
use object_store::path::Path;
use redis::aio::MultiplexedConnection;
use tokio::sync::{Semaphore, mpsc};
use tracing::error;

use super::job::{JobRecord, JobStatus, store as store_job};
use super::{OutputFormat, download, format};
use crate::error::APIResult;

/// Max jobs waiting in the channel before submits get a 429.
const MAX_QUEUE_DEPTH: usize = 32;
/// Concurrent jobs. Each one uses all cores via rayon and holds the full demo in
/// memory, so keep this tiny. Bump only after measuring headroom.
pub(super) const MAX_CONCURRENT: usize = 1;
/// Rough per-job duration used purely for the status endpoint's wait estimate.
pub(super) const AVG_JOB_SECONDS: u64 = 30;

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
    pub(crate) fn spawn(redis: MultiplexedConnection, r2: AmazonS3, public_url: String) -> Self {
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
    let mut record = JobRecord {
        status: JobStatus::Running,
        match_id: job.match_id,
        format: job.format,
        queue_ticket: job.queue_ticket,
        enqueued_at: job.enqueued_at,
        running_since: Some(chrono::Utc::now().timestamp()),
        result_url: None,
        error: None,
    };
    if let Err(e) = store_job(&mut redis, &job.job_id, &record).await {
        error!("Failed to mark demo query job {} running: {e}", job.job_id);
        return;
    }

    match process(r2, public_url, &job).await {
        Ok(result_url) => {
            record.status = JobStatus::Done;
            record.result_url = Some(result_url);
        }
        Err(e) => {
            record.status = JobStatus::Failed;
            record.error = Some(e.to_string());
        }
    }

    if let Err(e) = store_job(&mut redis, &job.job_id, &record).await {
        error!("Failed to store demo query job {} result: {e}", job.job_id);
    }
}

async fn process(r2: &AmazonS3, public_url: &str, job: &QueryJob) -> APIResult<String> {
    let compressed = download::download_demo(&job.demo_url).await?;
    let demo = format::decompress(compressed).await?;
    let artifact = format::run_and_serialize(demo, &job.sql, job.format).await?;

    let object_key = format!("{}.{}", job.job_id, job.format.extension());
    r2.put(&Path::from(object_key.clone()), artifact.into())
        .await?;

    Ok(format!("{public_url}/{object_key}"))
}
