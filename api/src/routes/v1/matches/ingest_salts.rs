use core::ops::Not;
use core::time::Duration;
use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::Mutex;
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
        let salt = salt.into();
        inserter.write(&salt).await?;
        HAS_SALTS_IN_CLICKHOUSE.lock().await.insert(
            (
                salt.match_id,
                salt.metadata_salt.is_some(),
                salt.replay_salt.is_some(),
            ),
            Arc::new(Mutex::new(TimedCache::with_lifespan(Duration::from_secs(
                60 * 60,
            )))),
        );
    }
    inserter.end().await
}

#[cached(
    ty = "TimedCache<(u64, bool, bool), bool>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
    convert = "{ (match_id, metadata, replay) }",
    sync_writes = "by_key",
    key = "(u64, bool, bool)"
)]
pub(super) async fn has_salts_in_clickhouse(
    ch_client: &clickhouse::Client,
    match_id: u64,
    metadata: bool,
    replay: bool,
) -> bool {
    #[derive(Deserialize, Row)]
    struct HasSalts {
        has_metadata: Option<u8>,
        has_replay: Option<u8>,
    }
    ch_client
        .query(
            "SELECT metadata_salt > 0 AS has_metadata, replay_salt > 0 AS has_replay FROM match_salts FINAL WHERE match_id = ?",
        )
        .bind(match_id)
        .fetch_one::<HasSalts>()
        .await
        .is_ok_and(|s| {
            (s.has_metadata.unwrap_or_default() == 1 && metadata) ||
                (s.has_replay.unwrap_or_default() == 1 && replay)
        })
}

#[cached(
    ty = "TimedCache<String, Option<ClickhouseSalts>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
    convert = r#"{ format!("{salt:?}") }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn validate_salt(
    steam_client: &SteamClient,
    mut salt: ClickhouseSalts,
) -> Option<ClickhouseSalts> {
    if salt.match_id > 100000000 {
        warn!("Match id too high, skipping");
        return None;
    }

    if salt.metadata_salt.is_some() && steam_client.metadata_file_exists(&salt).await.is_err() {
        warn!("Invalid metadata salt for match_id {}", salt.match_id);
        salt.metadata_salt = None;
    }
    if salt.replay_salt.is_some() && steam_client.replay_file_exists(&salt).await.is_err() {
        warn!("Invalid replay salt for match_id {}", salt.match_id);
        salt.replay_salt = None;
    }
    if salt.metadata_salt.is_some() || salt.replay_salt.is_some() {
        Some(salt)
    } else {
        None
    }
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

    let new_match_salts = futures::stream::iter(match_salts)
        .map(|salt| {
            let ch_client = &state.ch_client;
            async move {
                has_salts_in_clickhouse(
                    ch_client,
                    salt.match_id,
                    salt.metadata_salt.is_some(),
                    salt.replay_salt.is_some(),
                )
                .await
                .not()
                .then_some(salt)
            }
        })
        .buffer_unordered(10)
        .filter_map(|s| async move { s })
        .collect::<Vec<_>>()
        .await;

    if new_match_salts.is_empty() {
        debug!("No new salts to ingest");
        return Ok(Json(json!({ "status": "success" })));
    }

    // Check if the salts are valid if not sent by the internal tools
    let match_salts: Vec<ClickhouseSalts> = if bypass_check {
        new_match_salts
    } else {
        futures::stream::iter(new_match_salts)
            .map(|salt| {
                let steam_client = state.steam_client.clone();
                async move { validate_salt(&steam_client, salt).await }
            })
            .buffer_unordered(10)
            .filter_map(|salt| async move { salt })
            .collect::<Vec<_>>()
            .await
    };

    if match_salts.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No valid salts provided",
        ));
    }

    if match_salts.len() > 1 {
        debug!("Inserting salts: {}", match_salts.len());
    }
    insert_salts_to_clickhouse(&state.ch_client, match_salts).await?;
    Ok(Json(json!({ "status": "success" })))
}
