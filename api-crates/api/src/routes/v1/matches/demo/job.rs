//! Job state persisted in Redis. Jobs are reproducible, so the record is purely a
//! status pointer with a 24h TTL — the durable result lives in R2.

use redis::AsyncCommands as _;
use redis::aio::ConnectionManager;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::OutputFormat;
use crate::error::APIResult;

/// How long a job record lives in Redis.
pub(super) const JOB_TTL_SECS: u64 = 86_400;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum JobStatus {
    Queued,
    Running,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct JobRecord {
    pub(crate) status: JobStatus,
    pub(crate) match_id: u64,
    pub(crate) format: OutputFormat,
    pub(crate) queue_ticket: u64,
    /// Unix seconds the job was enqueued.
    pub(crate) enqueued_at: i64,
    /// Unix seconds the worker started processing, once it has.
    pub(crate) running_since: Option<i64>,
    /// Unix seconds the job finished (done or failed), once it has.
    pub(crate) completed_at: Option<i64>,
    pub(crate) result_url: Option<String>,
    pub(crate) error: Option<String>,
}

/// A job queued or running for longer than this has lost its worker to a restart or crash: the
/// queue lives in the API process, the record in Redis.
const ABANDONED_AFTER_SECS: i64 = 3600;

impl JobRecord {
    /// Whether submitting the job again should run it: it failed, or it was abandoned. Jobs are
    /// reproducible, so re-running one that is in fact still running only repeats work.
    pub(super) fn needs_rerun(&self, now: i64) -> bool {
        match self.status {
            JobStatus::Failed => true,
            JobStatus::Done => false,
            JobStatus::Queued | JobStatus::Running => {
                let since = self.running_since.unwrap_or(self.enqueued_at);
                now.saturating_sub(since) > ABANDONED_AFTER_SECS
            }
        }
    }
}

fn key(job_id: &str) -> String {
    format!("demo-query:job:{job_id}")
}

pub(crate) async fn load(
    redis: &mut ConnectionManager,
    job_id: &str,
) -> APIResult<Option<JobRecord>> {
    let raw: Option<String> = redis.get(key(job_id)).await?;
    Ok(raw.as_deref().and_then(|s| serde_json::from_str(s).ok()))
}

pub(crate) async fn store(
    redis: &mut ConnectionManager,
    job_id: &str,
    record: &JobRecord,
) -> APIResult<()> {
    let raw = serde_json::to_string(record)?;
    redis
        .set_ex::<_, _, ()>(key(job_id), raw, JOB_TTL_SECS)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(status: JobStatus, enqueued_at: i64, running_since: Option<i64>) -> JobRecord {
        JobRecord {
            status,
            match_id: 1,
            format: OutputFormat::default(),
            queue_ticket: 0,
            enqueued_at,
            running_since,
            completed_at: None,
            result_url: None,
            error: None,
        }
    }

    #[test]
    fn abandoned_jobs_rerun() {
        let now = 10_000;
        assert!(!record(JobStatus::Queued, now - 60, None).needs_rerun(now));
        assert!(record(JobStatus::Queued, now - 3_601, None).needs_rerun(now));
        assert!(!record(JobStatus::Running, now - 3_601, Some(now - 60)).needs_rerun(now));
        assert!(record(JobStatus::Running, now - 7_200, Some(now - 3_601)).needs_rerun(now));
        assert!(!record(JobStatus::Done, 0, Some(0)).needs_rerun(now));
        assert!(record(JobStatus::Failed, now, None).needs_rerun(now));
    }
}
