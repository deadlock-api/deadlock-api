use core::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::job::{self, JobRecord, JobStatus};
use super::worker::QueryJob;
use super::{OutputFormat, job_id};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::salts::fetch_match_salts;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(Deserialize, ToSchema)]
pub(super) struct DemoQueryRequest {
    /// Match whose demo to query.
    match_id: u64,
    /// SQL query to run over the demo's entity/event tables (see `/demo/schema`).
    query: String,
    /// Output format of the result artifact.
    #[serde(default)]
    format: OutputFormat,
}

#[derive(Serialize, ToSchema)]
pub(super) struct DemoQueryJobResponse {
    /// Stable id of the job; poll `/demo/query/{job_id}` for status and the result URL.
    job_id: String,
    status: JobStatus,
}

#[utoipa::path(
    post,
    path = "/query",
    request_body = DemoQueryRequest,
    responses(
        (status = ACCEPTED, body = DemoQueryJobResponse, description = "Job queued"),
        (status = OK, body = DemoQueryJobResponse, description = "Job already exists (deduplicated)"),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = NOT_FOUND, description = "No demo / salts available for the match"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded or queue full"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to queue the job")
    ),
    tags = ["Demo"],
    summary = "Demo Query",
    description = "
Submit a SQL query against a match's demo file. The work (download + decompress + parse +
query) takes ~12s, so this is asynchronous: the endpoint returns a `job_id` you poll via
`/demo/query/{job_id}`. Once done, the status response carries a public URL to the result
artifact (Parquet or NDJSON).

Identical `(match_id, query, format)` submissions are deduplicated and reuse a cached result.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 5req/h |
| Key | 50req/h |
| Global | 100req/h |
"
)]
pub(super) async fn submit(
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
    payload: Result<Json<DemoQueryRequest>, JsonRejection>,
) -> APIResult<impl IntoResponse> {
    let Json(req) = payload.map_err(|rejection| {
        APIError::status_msg(
            rejection.status(),
            format!("Invalid request body: {rejection}"),
        )
    })?;

    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "demo_query",
            &[
                Quota::ip_limit(5, Duration::from_hours(1)),
                Quota::key_limit(50, Duration::from_hours(1)),
                Quota::global_limit(100, Duration::from_hours(1)),
            ],
        )
        .await?;

    let id = job_id(req.match_id, &req.query, req.format);

    // Dedup / cache: a queued/running/done job short-circuits. A failed job does not —
    // re-submitting the same triple re-runs it.
    if let Some(existing) = job::load(&mut state.redis_client, &id).await?
        && existing.status != JobStatus::Failed
    {
        return Ok((
            StatusCode::OK,
            Json(DemoQueryJobResponse {
                job_id: id,
                status: existing.status,
            }),
        ));
    }

    // Resolve salts here, while we hold the rate-limit key; the background worker cannot.
    let salts = fetch_match_salts(&state, &rate_limit_key, req.match_id, false, false).await?;
    let (Some(cluster_id), Some(replay_salt)) = (salts.replay_group_id, salts.replay_salt) else {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            format!("No demo available for match {}", req.match_id),
        ));
    };
    let demo_url = format!(
        "http://replay{cluster_id}.valve.net/1422450/{}_{replay_salt}.dem.bz2",
        req.match_id
    );

    let slot = state.demo_query_queue.reserve().ok_or_else(|| {
        APIError::status_msg(
            StatusCode::TOO_MANY_REQUESTS,
            "Demo query queue is full, retry later",
        )
    })?;

    let enqueued_at = chrono::Utc::now().timestamp();

    // Persist the queued record before releasing the job, so the worker never observes
    // a job whose record doesn't exist yet.
    let record = JobRecord {
        status: JobStatus::Queued,
        match_id: req.match_id,
        format: req.format,
        queue_ticket: slot.ticket,
        enqueued_at,
        running_since: None,
        result_url: None,
        error: None,
    };
    job::store(&mut state.redis_client, &id, &record).await?;

    slot.send(QueryJob {
        job_id: id.clone(),
        match_id: req.match_id,
        demo_url,
        sql: req.query,
        format: req.format,
        enqueued_at,
        queue_ticket: 0, // overwritten by QuerySlot::send
    });

    Ok((
        StatusCode::ACCEPTED,
        Json(DemoQueryJobResponse {
            job_id: id,
            status: JobStatus::Queued,
        }),
    ))
}
