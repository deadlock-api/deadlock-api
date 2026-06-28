//! Job state persisted in Redis. Jobs are reproducible, so the record is purely a
//! status pointer with a 24h TTL — the durable result lives in R2.

use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
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

fn key(job_id: &str) -> String {
    format!("demo-query:job:{job_id}")
}

pub(crate) async fn load(
    redis: &mut MultiplexedConnection,
    job_id: &str,
) -> APIResult<Option<JobRecord>> {
    let raw: Option<String> = redis.get(key(job_id)).await?;
    Ok(raw.as_deref().and_then(|s| serde_json::from_str(s).ok()))
}

pub(crate) async fn store(
    redis: &mut MultiplexedConnection,
    job_id: &str,
    record: &JobRecord,
) -> APIResult<()> {
    let raw = serde_json::to_string(record)?;
    redis
        .set_ex::<_, _, ()>(key(job_id), raw, JOB_TTL_SECS)
        .await?;
    Ok(())
}
