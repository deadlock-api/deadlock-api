use core::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tracing::{debug, warn};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ClickhouseSalts;
use crate::services::steam::client::SteamClient;

pub(super) async fn insert_salts_to_clickhouse(
    ch_client: &clickhouse::Client,
    salts: Vec<impl Into<ClickhouseSalts>>,
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert::<ClickhouseSalts>("match_salts").await?;
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
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(match_salts): Json<Vec<ClickhouseSalts>>,
) -> APIResult<impl IntoResponse> {
    let bypass_check = headers
        .get("X-API-Key")
        .and_then(|key| key.to_str().ok().map(ToString::to_string))
        .is_some_and(|key| key == state.config.internal_api_key);

    debug!("Received salts: {match_salts:?}");

    // Check if the salts are valid if not sent by the internal tools
    let match_salts: Vec<ClickhouseSalts> = if bypass_check {
        match_salts
    } else {
        futures::stream::iter(match_salts)
            .map(|salt| {
                let steam_client = state.steam_client.clone();
                let ch_client = state.ch_client.clone();
                async move { validate_salt(&steam_client, &ch_client, &salt).await }
            })
            .buffer_unordered(10)
            .filter_map(core::future::ready)
            .collect::<Vec<_>>()
            .await
    };

    if match_salts.is_empty() {
        return Err(APIError::status_msg(
            reqwest::StatusCode::BAD_REQUEST,
            "No valid salts provided.",
        ));
    }

    insert_salts_to_clickhouse(&state.ch_client, match_salts).await?;

    Ok(Json(json!({ "status": "success" })))
}

#[cached(
    ty = "TimedCache<(u64, bool, bool), bool>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
    result = true,
    convert = "{ (match_id, metadata, replay) }",
    sync_writes = "by_key",
    key = "(u64, bool, bool)"
)]
pub(super) async fn has_salts_in_clickhouse(
    ch_client: &clickhouse::Client,
    match_id: u64,
    metadata: bool,
    replay: bool,
) -> clickhouse::error::Result<bool> {
    #[derive(Deserialize, Row)]
    struct HasSalts {
        has_metadata: bool,
        has_replay: bool,
    }
    ch_client
        .query(
            "SELECT metadata_salt > 0 AS has_metadata, replay_salt > 0 AS has_replay FROM match_salts FINAL WHERE match_id = ?",
        )
        .bind(match_id)
        .fetch_one::<HasSalts>()
        .await
        .map(|s| s.has_metadata && metadata || s.has_replay && replay)
}

async fn validate_salt(
    steam_client: &SteamClient,
    ch_client: &clickhouse::Client,
    salt: &ClickhouseSalts,
) -> Option<ClickhouseSalts> {
    if salt.match_id > 100000000 {
        warn!("Match id too high, skipping");
        return None;
    }

    let has_salts_already = has_salts_in_clickhouse(
        ch_client,
        salt.match_id,
        salt.metadata_salt.is_some(),
        salt.replay_salt.is_some(),
    )
    .await
    .unwrap_or_default();
    if has_salts_already {
        return None;
    }

    let mut salt = salt.clone();
    if salt.metadata_salt.is_some() {
        let is_valid = tryhard::retry_fn(|| steam_client.metadata_file_exists(&salt))
            .retries(30)
            .linear_backoff(Duration::from_millis(500))
            .await
            .is_ok();
        if !is_valid {
            warn!("Invalid metadata salt for match_id {}", salt.match_id);
            salt.metadata_salt = None;
        }
    }
    if salt.replay_salt.is_some() {
        let is_valid = tryhard::retry_fn(|| steam_client.replay_file_exists(&salt))
            .retries(30)
            .linear_backoff(Duration::from_millis(500))
            .await
            .is_ok();
        if !is_valid {
            warn!("Invalid replay salt for match_id {}", salt.match_id);
            salt.replay_salt = None;
        }
    }
    if salt.metadata_salt.is_some() || salt.replay_salt.is_some() {
        Some(salt)
    } else {
        None
    }
}
