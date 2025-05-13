use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{RateLimitClient, RateLimitQuota};

use crate::routes::v1::matches::salts::fetch_match_salts;
use crate::routes::v1::matches::types::MatchIdQuery;
use crate::services::steam::client::SteamClient;
use crate::state::AppState;
use async_compression::tokio::bufread::BzDecoder;
use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use futures::future::join;
use metrics::counter;
use object_store::ObjectStore;
use prost::Message;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tracing::{debug, error};
use valveprotos::deadlock::{CMsgMatchMetaData, CMsgMatchMetaDataContents};

async fn fetch_from_s3(s3: &impl ObjectStore, file: &str) -> object_store::Result<Vec<u8>> {
    s3.get(&object_store::path::Path::from(file))
        .await?
        .bytes()
        .await
        .map(|r| r.to_vec())
}

#[allow(clippy::too_many_arguments)]
async fn fetch_match_metadata_raw(
    rate_limit_client: &RateLimitClient,
    rate_limit_key: &RateLimitKey,
    steam_client: &SteamClient,
    http_client: &reqwest::Client,
    ch_client: &clickhouse::Client,
    s3: &impl ObjectStore,
    s3_cache: &impl ObjectStore,
    match_id: u64,
) -> APIResult<Vec<u8>> {
    rate_limit_client
        .apply_limits(
            rate_limit_key,
            "match_metadata_s3_cache",
            &[
                RateLimitQuota::ip_limit(10000, Duration::from_secs(10)),
                RateLimitQuota::global_limit(10000, Duration::from_secs(1)),
            ],
        )
        .await?;

    // Try to fetch from the cache first
    let results = join(
        fetch_from_s3(s3_cache, &format!("{match_id}.meta.bz2")),
        fetch_from_s3(s3_cache, &format!("{match_id}.meta_hltv.bz2")),
    )
    .await;
    if let Ok(data) = results.0 {
        debug!("Match metadata found in cache");
        counter!("metadata.fetch", "s3" => "minio", "source" => "salt").increment(1);
        return Ok(data);
    }
    if let Ok(data) = results.1 {
        debug!("Match metadata found in cache, hltv");
        counter!("metadata.fetch", "s3" => "minio", "source" => "hltv").increment(1);
        return Ok(data);
    }

    rate_limit_client
        .apply_limits(
            rate_limit_key,
            "match_metadata_s3",
            &[
                RateLimitQuota::ip_limit(1000, Duration::from_secs(10)),
                RateLimitQuota::global_limit(700, Duration::from_secs(1)),
            ],
        )
        .await?;

    // If not in cache, fetch from S3
    let results = join(
        fetch_from_s3(s3, &format!("processed/metadata/{match_id}.meta.bz2")),
        fetch_from_s3(s3, &format!("processed/metadata/{match_id}.meta_hltv.bz2")),
    )
    .await;
    if let Ok(data) = results.0 {
        debug!("Match metadata found on s3");
        counter!("metadata.fetch", "s3" => "hetzner", "source" => "salt").increment(1);
        return Ok(data);
    }
    if let Ok(data) = results.1 {
        debug!("Match metadata found on s3, hltv");
        counter!("metadata.fetch", "s3" => "hetzner", "source" => "hltv").increment(1);
        return Ok(data);
    }

    // If not in S3, fetch from Steam
    let salts = fetch_match_salts(
        rate_limit_client,
        rate_limit_key,
        steam_client,
        ch_client,
        match_id,
        false,
    )
    .await?;
    http_client
        .get(format!(
            "http://replay{}.valve.net/1422450/{}_{}.meta.bz2",
            salts.replay_group_id.unwrap_or_default(),
            match_id,
            salts.metadata_salt.unwrap_or_default()
        ))
        .send()
        .await
        .and_then(|resp| resp.error_for_status())
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
    params(MatchIdQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = NOT_FOUND, description = "Match metadata not found"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching match metadata failed")
    ),
    tags = ["Matches"],
    summary = "Match Metadata as Protobuf",
    description = r#"
This endpoints returns the raw .meta.bz2 file for the given `match_id`.

You have to decompress it and decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgMatchMetaData
- CMsgMatchMetaDataContents
    "#
)]
pub async fn metadata_raw(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    match tryhard::retry_fn(|| {
        fetch_match_metadata_raw(
            &state.rate_limit_client,
            &rate_limit_key,
            &state.steam_client,
            &state.http_client,
            &state.ch_client,
            &state.s3_client,
            &state.s3_cache_client,
            match_id,
        )
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await
    {
        Ok(r) => Ok(r),
        Err(e) => {
            error!("Failed to fetch match metadata: {e}");
            Err(e)
        }
    }
}

#[utoipa::path(
    get,
    path = "/{match_id}/metadata",
    params(MatchIdQuery),
    responses(
        (status = OK, description = "Match metadata, see protobuf type: CMsgMatchMetaDataContents"),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = NOT_FOUND, description = "Match metadata not found"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing match metadata failed")
    ),
    tags = ["Matches"],
    summary = "Matches Metadata",
    description = r#"
This endpoint returns the match metadata for the given `match_id` parsed into JSON.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgMatchMetaData
- CMsgMatchMetaDataContents
    "#
)]
pub async fn metadata(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    match tryhard::retry_fn(|| async {
        let raw_data = fetch_match_metadata_raw(
            &state.rate_limit_client,
            &rate_limit_key,
            &state.steam_client,
            &state.http_client,
            &state.ch_client,
            &state.s3_client,
            &state.s3_cache_client,
            match_id,
        )
        .await?;
        parse_match_metadata_raw(&raw_data).await.map(Json)
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await
    {
        Ok(r) => Ok(r),
        Err(e) => {
            error!("Failed to fetch match metadata: {e}");
            Err(e)
        }
    }
}
