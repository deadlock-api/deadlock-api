use std::collections::HashMap;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::{is_safe_identifier, require_game_server_secret};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::clickhouse_insert_batcher::{BatchInsert, ClickhouseInsertBatcher};

const MAX_METADATA_ENTRIES: usize = 32;
const MAX_METADATA_KEY_LEN: usize = 64;
const MAX_METADATA_VALUE_LEN: usize = 256;

pub(crate) struct GameServerMetricsInsert;

impl BatchInsert for GameServerMetricsInsert {
    type Row = GameServerMetricRow;

    fn table_name() -> &'static str {
        "game_server_metrics"
    }
}

pub(crate) type GameServerMetricsInsertBatcher = ClickhouseInsertBatcher<GameServerMetricsInsert>;

#[derive(Debug, Clone, Serialize, Row)]
pub(crate) struct GameServerMetricRow {
    pub(crate) timestamp: i64,
    pub(crate) server_id: String,
    pub(crate) region: String,
    pub(crate) game_mode: String,
    pub(crate) game_mode_version: String,
    pub(crate) map: String,
    pub(crate) metric_name: String,
    pub(crate) account_id: u32,
    pub(crate) metric_value: f64,
    pub(crate) metadata: HashMap<String, String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub(super) struct MetricIngestRequest {
    /// Unique identifier for the game server reporting the metric
    server_id: String,
    /// Region the server is located in (e.g. "eu", "na")
    region: String,
    /// Game mode this metric applies to (e.g. "speedrun")
    game_mode: String,
    /// Optional game-mode version tag (e.g. "v2", "season3") for versioning leaderboards
    #[serde(default)]
    game_mode_version: Option<String>,
    /// Optional map identifier the metric was produced on
    #[serde(default)]
    map: Option<String>,
    /// Name of the metric (e.g. `run_time`)
    metric_name: String,
    /// Steam account id (`UInt32`) of the player this metric is about
    account_id: u32,
    /// The primary numeric measurement for this metric
    metric_value: f64,
    /// Free-form key/value metadata for game-mode-specific context
    #[serde(default)]
    metadata: HashMap<String, String>,
}

#[utoipa::path(
    post,
    path = "/metrics",
    request_body = MetricIngestRequest,
    responses(
        (status = ACCEPTED, description = "Metric accepted for ingestion."),
        (status = UNAUTHORIZED, description = "Invalid or missing game server secret."),
        (status = BAD_REQUEST, description = "Invalid request body."),
    ),
    tags = ["Servers"],
    summary = "Game Server Metric Ingest",
    description = "
Ingests a single metric event reported by a game server. The schema is intentionally
flexible: `metric_value` carries the primary numeric measurement and `metadata` holds
arbitrary key/value context that varies per game mode or metric. Optional `map` and
`game_mode_version` let callers segment leaderboards per map or per ruleset revision.
Requires a valid game server secret as a Bearer token.
    "
)]
pub(super) async fn ingest(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<MetricIngestRequest>,
) -> APIResult<impl IntoResponse> {
    require_game_server_secret(&headers, &state.config.game_server_secret)?;

    let required = [
        ("server_id", request.server_id.as_str()),
        ("region", request.region.as_str()),
        ("game_mode", request.game_mode.as_str()),
        ("metric_name", request.metric_name.as_str()),
    ];
    for (field, value) in required {
        if !is_safe_identifier(value) {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                format!("{field} must be 1-64 alphanumeric characters, hyphens, or underscores"),
            ));
        }
    }

    let optional = [
        ("game_mode_version", request.game_mode_version.as_deref()),
        ("map", request.map.as_deref()),
    ];
    for (field, value) in optional {
        if let Some(v) = value
            && !is_safe_identifier(v)
        {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                format!("{field} must be 1-64 alphanumeric characters, hyphens, or underscores"),
            ));
        }
    }

    if !request.metric_value.is_finite() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "metric_value must be a finite number",
        ));
    }

    if request.metadata.len() > MAX_METADATA_ENTRIES {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("metadata must contain at most {MAX_METADATA_ENTRIES} entries"),
        ));
    }
    for (k, v) in &request.metadata {
        if k.is_empty() || k.len() > MAX_METADATA_KEY_LEN {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                format!("metadata keys must be 1-{MAX_METADATA_KEY_LEN} characters"),
            ));
        }
        if v.len() > MAX_METADATA_VALUE_LEN {
            return Err(APIError::status_msg(
                StatusCode::BAD_REQUEST,
                format!("metadata values must be at most {MAX_METADATA_VALUE_LEN} characters"),
            ));
        }
    }

    let row = GameServerMetricRow {
        timestamp: chrono::Utc::now().timestamp_millis(),
        server_id: request.server_id,
        region: request.region,
        game_mode: request.game_mode,
        game_mode_version: request.game_mode_version.unwrap_or_default(),
        map: request.map.unwrap_or_default(),
        metric_name: request.metric_name,
        account_id: request.account_id,
        metric_value: request.metric_value,
        metadata: request.metadata,
    };

    state.batchers.game_server_metrics.insert(vec![row]).await;

    Ok(StatusCode::ACCEPTED)
}
