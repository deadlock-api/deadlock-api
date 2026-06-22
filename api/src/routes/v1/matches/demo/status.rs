use axum::Json;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::IntoResponse;
use serde::Serialize;
use utoipa::ToSchema;

use super::OutputFormat;
use super::job::{self, JobRecord, JobStatus};
use super::worker::{AVG_JOB_SECONDS, MAX_CONCURRENT};
use crate::context::AppState;
use crate::error::{APIError, APIResult};

#[derive(Serialize, ToSchema)]
pub(super) struct DemoQueryStatusResponse {
    job_id: String,
    status: JobStatus,
    match_id: u64,
    format: OutputFormat,
    /// Rough seconds until the result is ready, while `queued` or `running`.
    #[serde(skip_serializing_if = "Option::is_none")]
    estimated_wait_seconds: Option<u64>,
    /// Public URL of the result artifact, once `done`.
    #[serde(skip_serializing_if = "Option::is_none")]
    result_url: Option<String>,
    /// Failure reason, once `failed`.
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[utoipa::path(
    get,
    path = "/query/{job_id}",
    params(("job_id" = String, Path, description = "Job id returned by POST /demo/query")),
    responses(
        (status = OK, body = DemoQueryStatusResponse),
        (status = NOT_FOUND, description = "Job not found or expired")
    ),
    tags = ["Demo"],
    summary = "Demo Query Status",
    description = "
Returns the status of a demo query job. While `queued`/`running` it includes a rough
`estimated_wait_seconds`; when `done` it includes `result_url` (a public link to the
Parquet/NDJSON artifact); when `failed` it includes `error`.
"
)]
pub(super) async fn status(
    Path(job_id): Path<String>,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let record = job::load(&mut state.redis_client, &job_id)
        .await?
        .ok_or_else(|| APIError::status_msg(StatusCode::NOT_FOUND, "Job not found or expired"))?;

    let estimated_wait_seconds = estimate(
        &record,
        state.demo_query_queue.completed(),
        chrono::Utc::now().timestamp(),
    );

    // A completed job is immutable, so it can be cached; everything else is still in
    // flight and must always be re-fetched.
    let cache_control = if record.status == JobStatus::Done {
        "public, max-age=86400"
    } else {
        "no-store"
    };

    Ok((
        [(header::CACHE_CONTROL, cache_control)],
        Json(DemoQueryStatusResponse {
            job_id,
            status: record.status,
            match_id: record.match_id,
            format: record.format,
            estimated_wait_seconds,
            result_url: record.result_url,
            error: record.error,
        }),
    ))
}

fn estimate(record: &JobRecord, completed: u64, now: i64) -> Option<u64> {
    match record.status {
        JobStatus::Queued => {
            let ahead = record.queue_ticket.saturating_sub(completed);
            let total =
                ahead.saturating_add(1).saturating_mul(AVG_JOB_SECONDS) / MAX_CONCURRENT as u64;
            let elapsed = u64::try_from(now.saturating_sub(record.enqueued_at)).unwrap_or(0);
            Some(total.saturating_sub(elapsed))
        }
        JobStatus::Running => {
            let elapsed = record.running_since.map_or(0, |since| {
                u64::try_from(now.saturating_sub(since)).unwrap_or(0)
            });
            Some(AVG_JOB_SECONDS.saturating_sub(elapsed))
        }
        JobStatus::Done | JobStatus::Failed => None,
    }
}
