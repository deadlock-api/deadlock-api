use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::MatchIdQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use serde::Serialize;
use serde_json::json;
use uuid::Uuid;

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

#[utoipa::path(
    get,
    path = "/{match_id}/ingest",
    responses(
        (status = OK),
        (status = UNAUTHORIZED, description = "Unauthorized"),
        (status = INTERNAL_SERVER_ERROR, description = "Sending event failed")
    ),
    tags = ["Internal"],
    summary = "Match Ingest Event",
    description = r"This endpoint is used internally to send a match ingest event to Hook0."
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
    let payload = serde_json::to_string(&payload).map_err(|e| APIError::InternalError {
        message: format!("Failed to serialize payload: {e}"),
    })?;
    let event_id = Uuid::new_v4().to_string();
    let iso_datetime = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Micros, true);
    state
        .http_client
        .post(format!("{}/event", state.config.hook0_api_url))
        .bearer_auth(state.config.hook0_api_key)
        .json(&json!({
            "application_id": state.config.hook0_application_id,
            "event_id": event_id,
            "event_type": "match.metadata.created",
            "labels": {"all": "yes"},
            "occurred_at": iso_datetime,
            "payload_content_type": "application/json",
            "payload": payload,
        }))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map(|_| json!({"status": "success"}))
        .map(Json)
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to send event: {e}"),
        })
}
