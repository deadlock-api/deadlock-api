use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::MatchIdQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use serde::Serialize;
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::time::Duration;
use tracing::warn;

#[derive(Debug, Clone, Serialize)]
pub struct MatchCreatedWebhookPayload {
    match_id: u64,
    salts_url: String,
    metadata_url: String,
    raw_metadata_url: String,
}

impl MatchCreatedWebhookPayload {
    pub fn new(match_id: u64) -> Self {
        Self {
            match_id,
            salts_url: format!("https://api.deadlock-api.com/v1/matches/{match_id}/salts"),
            metadata_url: format!("https://api.deadlock-api.com/v1/matches/{match_id}/metadata"),
            raw_metadata_url: format!(
                "https://api.deadlock-api.com/v1/matches/{match_id}/metadata/raw"
            ),
        }
    }
}

#[cached(
    ty = "TimedCache<String, Vec<String>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("") }"#,
    sync_writes = true
)]
async fn get_webhook_urls(postgres_client: &Pool<Postgres>) -> Result<Vec<String>, APIError> {
    sqlx::query!("SELECT webhook_url FROM webhooks")
        .fetch_all(postgres_client)
        .await
        .map(|rows| rows.into_iter().map(|row| row.webhook_url).collect())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch webhook URLs: {e}"),
        })
}

#[utoipa::path(
    post,
    path = "/{match_id}/ingest",
    responses(
        (status = OK),
        (status = UNAUTHORIZED, description = "Unauthorized"),
        (status = INTERNAL_SERVER_ERROR, description = "Sending event failed")
    ),
    tags = ["Internal"],
    summary = "Match Ingest Event",
    description = r"This endpoint is used internally to send a match ingest event to webhook subcribers."
)]
pub async fn ingest(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    headers
        .get("X-API-Key")
        .and_then(|key| key.to_str().ok().map(|key| key.to_string()))
        .map(|key| key == state.config.internal_api_key)
        .ok_or_else(|| APIError::StatusMsg {
            status: reqwest::StatusCode::UNAUTHORIZED,
            message: "Unauthorized".to_string(),
        })?;

    let payload = MatchCreatedWebhookPayload::new(match_id);
    let webhook_urls: Vec<String> = get_webhook_urls(&state.postgres_client).await?;
    for webhook_url in webhook_urls {
        if let Err(e) = state
            .http_client
            .post(&webhook_url)
            .json(&payload)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .and_then(|m| m.error_for_status())
        {
            warn!("Failed to send webhook to {webhook_url}: {e}");
        }
    }
    Ok(Json(json!({ "status": "success" })))
}
