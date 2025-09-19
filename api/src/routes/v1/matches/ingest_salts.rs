
use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use serde_json::json;
use tracing::debug;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ClickhouseSalts;

pub(super) async fn insert_salts_to_clickhouse(
    ch_client: &clickhouse::Client,
    salts: Vec<impl Into<ClickhouseSalts>>,
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert::<ClickhouseSalts>("match_salts")?;
    for salt in salts {
        inserter.write(&salt.into()).await?;
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
    State(state): State<AppState>,
    Json(match_salts): Json<Vec<ClickhouseSalts>>,
) -> APIResult<impl IntoResponse> {
    debug!("Received salts: {match_salts:?}");

    if match_salts.is_empty() {
        return Err(APIError::status_msg(
            reqwest::StatusCode::BAD_REQUEST,
            "No valid salts provided.",
        ));
    }

    insert_salts_to_clickhouse(&state.ch_client, match_salts).await?;

    Ok(Json(json!({ "status": "success" })))
}
