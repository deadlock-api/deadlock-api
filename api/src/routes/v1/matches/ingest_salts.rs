use core::time::Duration;
use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::json;
use tracing::debug;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ClickhouseSalts;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

const MAX_SALTS_PER_REQUEST: usize = 1000;

#[utoipa::path(
    post,
    path = "/salts",
    request_body = Vec<ClickhouseSalts>,
    responses(
        (status = OK),
        (status = BAD_REQUEST, description = "Provided parameters are invalid or the salt check failed."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Ingest failed")
    ),
    tags = ["Internal"],
    summary = "Match Salts Ingest",
    description = "
You can use this endpoint to help us collecting data.

The endpoint accepts a list of MatchSalts objects, which contain the following fields:

- `match_id`: The match ID
- `cluster_id`: The cluster ID
- `metadata_salt`: The metadata salt
- `replay_salt`: The replay salt
- `username`: The username of the person who submitted the match

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn ingest_salts(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    Json(match_salts): Json<Vec<ClickhouseSalts>>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "ingest_salts",
            &[Quota::ip_limit(100, Duration::from_secs(1))],
        )
        .await?;

    debug!("Received salts: {match_salts:?}");

    if match_salts.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No salts provided",
        ));
    }

    if match_salts.len() > MAX_SALTS_PER_REQUEST {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Too many salts provided (max {MAX_SALTS_PER_REQUEST}, got {})",
                match_salts.len()
            ),
        ));
    }

    let match_ids: Vec<u64> = match_salts.iter().map(|s| s.match_id).collect();
    let existing: HashMap<u64, (bool, bool)> = state
        .match_salts_exists_batcher
        .load_many(&match_ids)
        .await?
        .into_iter()
        .map(|r| {
            (
                r.match_id,
                (
                    r.has_metadata.unwrap_or(0) == 1,
                    r.has_replay.unwrap_or(0) == 1,
                ),
            )
        })
        .collect();

    let new_salts: Vec<ClickhouseSalts> = match_salts
        .into_iter()
        .filter(|salt| {
            let (has_metadata, has_replay) = existing
                .get(&salt.match_id)
                .copied()
                .unwrap_or((false, false));
            let metadata_needed = salt.metadata_salt.is_some();
            let replay_needed = salt.replay_salt.is_some();
            !((has_metadata && metadata_needed) || (has_replay && replay_needed))
        })
        .collect();

    if new_salts.is_empty() {
        debug!("No new salts to ingest");
        return Ok(Json(json!({ "status": "success" })));
    }

    if new_salts.len() > 1 {
        debug!("Inserting salts: {}", new_salts.len());
    }
    state.match_salts_insert_batcher.insert(new_salts).await;
    Ok(Json(json!({ "status": "success" })))
}
