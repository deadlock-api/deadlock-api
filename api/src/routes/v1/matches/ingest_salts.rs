use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ClickhouseSalts;
use crate::state::AppState;
use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use serde_json::json;
use std::time::Duration;
use tracing::debug;

async fn check_salt(http_client: &reqwest::Client, salts: &ClickhouseSalts) -> bool {
    let Some(cluster_id) = salts.cluster_id else {
        return false;
    };
    let Some(metadata_salt) = salts.metadata_salt else {
        return false;
    };
    http_client
        .head(format!(
            "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
            cluster_id, salts.match_id, metadata_salt
        ))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .is_ok()
}

pub async fn insert_salts_to_clickhouse(
    ch_client: &clickhouse::Client,
    salts: Vec<impl Into<ClickhouseSalts>>,
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert("match_salts")?;
    for salt in salts {
        let clickhouse_salt: ClickhouseSalts = salt.into();
        inserter.write(&clickhouse_salt).await?;
    }
    inserter.end().await
}

#[utoipa::path(
    post,
    path = "/salts",
    request_body = Vec<ClickhouseSalts>,
    responses(
        (status = OK),
        (status = BAD_REQUEST, description = "Provided parameters are invalid or the salt check failed."),
        (status = INTERNAL_SERVER_ERROR, description = "Ingest failed")
    ),
    tags = ["Internal"],
    summary = "Match Salts Ingest",
    description = r#"
You can use this endpoint to help us collecting data.

The endpoint accepts a list of MatchSalts objects, which contain the following fields:

- `match_id`: The match ID
- `cluster_id`: The cluster ID
- `metadata_salt`: The metadata salt
- `replay_salt`: The replay salt
- `username`: The username of the person who submitted the match
    "#
)]
pub async fn ingest_salts(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(match_salts): Json<Vec<ClickhouseSalts>>,
) -> APIResult<impl IntoResponse> {
    let bypass_check = headers
        .get("X-API-Key")
        .and_then(|key| key.to_str().ok().map(|key| key.to_string()))
        .is_some_and(|key| key == state.config.internal_api_key);

    debug!("Received salts: {match_salts:?}");

    // Check if the salts are valid if not sent by the internal tools
    let match_salts: Vec<ClickhouseSalts> = if !bypass_check {
        let mut valid_salts = Vec::new();
        for salt in match_salts.iter() {
            if check_salt(&state.http_client, salt).await {
                valid_salts.push(salt.clone());
            }
        }
        valid_salts
    } else {
        match_salts
    };

    if match_salts.is_empty() {
        return Err(APIError::StatusMsg {
            status: reqwest::StatusCode::BAD_REQUEST,
            message: "No valid salts provided.".to_string(),
        });
    }

    insert_salts_to_clickhouse(&state.clickhouse_client, match_salts)
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Ingest failed: {e}"),
        })?;

    Ok(Json(json!({ "status": "success" })))
}
