use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use async_compression::tokio::bufread::BzDecoder;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use futures::future::join;
use object_store::ObjectStore;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tracing::{debug, warn};
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse, CMsgMatchMetaData,
    CMsgMatchMetaDataContents, EgcCitadelClientMessages,
};

#[derive(Deserialize, IntoParams)]
pub struct MatchMetadataQuery {
    pub match_id: u64,
}

async fn fetch_from_s3(s3: &impl ObjectStore, file: &str) -> object_store::Result<Vec<u8>> {
    s3.get(&object_store::path::Path::from(file))
        .await?
        .bytes()
        .await
        .map(|r| r.to_vec())
}

#[derive(Row, Serialize, Deserialize)]
struct ClickhouseSalts {
    match_id: u64,
    metadata_salt: Option<u32>,
    replay_salt: Option<u32>,
    cluster_id: Option<u32>,
}

impl ClickhouseSalts {
    fn has_metadata_salt(&self) -> bool {
        self.cluster_id.is_some() && self.metadata_salt.unwrap_or_default() != 0
    }
}

impl From<ClickhouseSalts> for CMsgClientToGcGetMatchMetaDataResponse {
    fn from(value: ClickhouseSalts) -> Self {
        Self {
            result: None,
            metadata_salt: value.metadata_salt,
            replay_salt: value.replay_salt,
            replay_group_id: value.cluster_id,
            replay_valid_through: None,
            replay_processing_through: None,
        }
    }
}

async fn insert_salts_to_clickhouse(
    ch_client: &clickhouse::Client,
    match_id: u64,
    salts: &CMsgClientToGcGetMatchMetaDataResponse,
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client.insert("match_salts")?;
    inserter
        .write(&ClickhouseSalts {
            match_id,
            metadata_salt: salts.metadata_salt,
            replay_salt: salts.replay_salt,
            cluster_id: salts.replay_group_id,
        })
        .await?;
    inserter.end().await
}

#[cached(
    ty = "TimedCache<String, CMsgClientToGcGetMatchMetaDataResponse>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{match_id}") }"#,
    sync_writes = true
)]
async fn fetch_metadata_salts(
    config: &Config,
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    match_id: u64,
) -> APIResult<CMsgClientToGcGetMatchMetaDataResponse> {
    // Try fetch from Clickhouse DB
    let salts = ch_client
        .query("SELECT ?fields FROM match_salts WHERE match_id = ?")
        .bind(match_id)
        .fetch_one::<ClickhouseSalts>()
        .await;
    if let Ok(salts) = salts {
        if salts.has_metadata_salt() {
            debug!("Match metadata salts found in Clickhouse");
            return Ok(salts.into());
        }
    }

    // If not in Clickhouse, fetch from Steam
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        metadata_salt: None,
        target_account_id: None,
    };
    let response = utils::steam::call_steam_proxy(
        config,
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
        msg,
        &["GetMatchMetaData"],
        Duration::from_secs(30 * 60),
        Duration::from_secs(2),
    )
    .await;
    match response {
        Err(e) => {
            warn!("Failed to fetch match metadata salts from Steam: {e}");
        }
        Ok(r) => {
            match BASE64_STANDARD.decode(&r.data) {
                Err(e) => {
                    warn!("Failed to decode match metadata salts from Steam: {e}");
                }
                Ok(data) => {
                    match CMsgClientToGcGetMatchMetaDataResponse::decode(data.as_slice()) {
                        Err(e) => {
                            warn!("Failed to parse match metadata salts from Steam: {e}");
                        }
                        Ok(salts) => {
                            if salts.replay_group_id.is_some()
                                && salts.metadata_salt.unwrap_or_default() != 0
                            {
                                // Insert into Clickhouse
                                if let Err(e) =
                                    insert_salts_to_clickhouse(ch_client, match_id, &salts).await
                                {
                                    warn!(
                                        "Failed to insert match metadata salts into Clickhouse: {e}"
                                    );
                                }
                                debug!("Match metadata salts fetched from Steam");
                                return Ok(salts);
                            }
                        }
                    }
                }
            }
        }
    }
    Err(APIError::StatusMsg {
        status: reqwest::StatusCode::NOT_FOUND,
        message: format!("Match metadata salts for match {match_id} not found"),
    })
}

#[cached(
    ty = "TimedCache<String, Vec<u8>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("{match_id}") }"#,
    sync_writes = true
)]
async fn fetch_match_metadata_raw(
    config: &Config,
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    s3: &impl ObjectStore,
    s3_cache: &impl ObjectStore,
    match_id: u64,
) -> APIResult<Vec<u8>> {
    // Try to fetch from cache first
    let results = join(
        fetch_from_s3(s3_cache, &format!("{match_id}.meta.bz2")),
        fetch_from_s3(s3_cache, &format!("{match_id}.meta_hltv.bz2")),
    )
    .await;
    if let Ok(data) = results.0 {
        debug!("Match metadata found in cache");
        return Ok(data);
    }
    if let Ok(data) = results.1 {
        debug!("Match metadata found in cache, hltv");
        return Ok(data);
    }

    // If not in cache, fetch from S3
    let results = join(
        fetch_from_s3(s3, &format!("processed/metadata/{match_id}.meta.bz2")),
        fetch_from_s3(s3, &format!("processed/metadata/{match_id}.meta_hltv.bz2")),
    )
    .await;
    if let Ok(data) = results.0 {
        debug!("Match metadata found on s3");
        return Ok(data);
    }
    if let Ok(data) = results.1 {
        debug!("Match metadata found on s3, hltv");
        return Ok(data);
    }

    // If not in S3, fetch from Steam
    let salts = fetch_metadata_salts(config, http_client, ch_client, match_id).await?;
    http_client
        .get(format!(
            "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
            salts.replay_group_id.unwrap_or_default(),
            match_id,
            salts.metadata_salt.unwrap_or_default()
        ))
        .send()
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch match metadata: {e}"),
        })?
        .bytes()
        .await
        .map(|r| r.to_vec())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch match metadata: {e}"),
        })
}

async fn parse_match_metadata_raw(raw_data: &[u8]) -> APIResult<CMsgMatchMetaDataContents> {
    let mut decompressor = BzDecoder::new(raw_data);
    let mut buf = Vec::with_capacity(decompressor.get_ref().len());
    decompressor
        .read_to_end(&mut buf)
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to decompress match metadata: {e}"),
        })?;
    let match_data = CMsgMatchMetaData::decode(buf.as_slice())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to parse match metadata: {e}"),
        })?
        .match_details
        .ok_or_else(|| APIError::InternalError {
            message: "Failed to parse match metadata: No data".to_string(),
        })?;
    CMsgMatchMetaDataContents::decode(match_data.as_slice()).map_err(|e| APIError::InternalError {
        message: format!("Failed to parse match metadata contents: {e}"),
    })
}

#[utoipa::path(
    get,
    path = "/{match_id}/metadata/raw",
    params(MatchMetadataQuery),
    responses(
        (status = OK, body = [u8]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching match metadata failed")
    ),
    tags = ["Matches"],
    summary = "Match Metadata as Protobuf",
    description = r#"
This endpoints returns the raw .meta.bz2 file for the given `match_id`.

You have to decompress it and decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages: CMsgMatchMetaData, CMsgMatchMetaDataContents
    "#
)]
pub async fn metadata_raw(
    Path(MatchMetadataQuery { match_id }): Path<MatchMetadataQuery>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "match_metadata",
        &[RateLimitQuota::ip_limit(100, Duration::from_secs(1))],
    )
    .await?;
    tryhard::retry_fn(|| {
        fetch_match_metadata_raw(
            &state.config,
            &state.http_client,
            &state.clickhouse_client,
            &state.s3_client,
            &state.s3_cache_client,
            match_id,
        )
    })
    .retries(3)
    .fixed_backoff(std::time::Duration::from_millis(10))
    .await
}

#[utoipa::path(
    get,
    path = "/{match_id}/metadata",
    params(MatchMetadataQuery),
    responses(
        (status = OK, description = "Match metadata, see protobuf type: CMsgMatchMetaDataContents"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing match metadata failed")
    ),
    tags = ["Matches"],
    summary = "Matches Metadata",
    description = r#"
This endpoint returns the match metadata for the given `match_id` parsed into JSON.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages: CMsgMatchMetaData, CMsgMatchMetaDataContents
    "#
)]
pub async fn metadata(
    Path(MatchMetadataQuery { match_id }): Path<MatchMetadataQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let raw_data = tryhard::retry_fn(|| {
        fetch_match_metadata_raw(
            &state.config,
            &state.http_client,
            &state.clickhouse_client,
            &state.s3_client,
            &state.s3_cache_client,
            match_id,
        )
    })
    .retries(3)
    .fixed_backoff(std::time::Duration::from_millis(10))
    .await?;
    parse_match_metadata_raw(&raw_data).await.map(Json)
}
