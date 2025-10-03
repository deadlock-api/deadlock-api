use core::time::Duration;

use async_compression::tokio::bufread::BzDecoder;
use axum::Json;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use bytes::Bytes;
use futures::future::join;
use futures::stream::BoxStream;
use metrics::counter;
use object_store::aws::AmazonS3;
use object_store::path::Path as S3Path;
use object_store::{GetResult, ObjectStore};
use prost::Message;
use serde::Deserialize;
use tokio::io::AsyncReadExt;
use tokio::sync::OnceCell;
use tracing::debug;
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgMatchMetaData, CMsgMatchMetaDataContents, CMsgMatchMetaDataContentsPatched,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::salts::fetch_match_salts;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Quota, RateLimitClient};
use crate::services::steam::client::SteamClient;
use crate::utils::types::MatchIdQuery;

static MIN_MATCH_ID_IN_CACHE: OnceCell<u64> = OnceCell::const_new();

async fn min_cache_match_id(ch_client: &clickhouse::Client) -> &u64 {
    MIN_MATCH_ID_IN_CACHE
        .get_or_init(|| async { ch_client
            .query("SELECT min(match_id) FROM match_info WHERE start_time > now() - INTERVAL 2 WEEK")
            .fetch_one()
            .await
            .unwrap_or_default() })
        .await
}

#[derive(Deserialize, IntoParams)]
pub(super) struct MetadataQuery {
    is_custom: Option<bool>,
}

async fn fetch_from_s3<T: Into<S3Path>>(s3: &AmazonS3, key: T) -> object_store::Result<Vec<u8>> {
    s3.get(&key.into()).await?.bytes().await.map(|b| b.to_vec())
}

#[allow(clippy::too_many_arguments)]
async fn fetch_match_metadata_raw(
    rate_limit_client: &RateLimitClient,
    rate_limit_key: &RateLimitKey,
    steam_client: &SteamClient,
    ch_client: &clickhouse::Client,
    s3: &AmazonS3,
    s3_cache: Option<&AmazonS3>,
    match_id: u64,
    is_custom: bool,
) -> APIResult<Vec<u8>> {
    // Try to fetch from the cache first
    if match_id >= *min_cache_match_id(ch_client).await
        && let Some(s3_cache) = s3_cache
    {
        let results = join(
            fetch_from_s3(s3_cache, format!("{match_id}.meta.bz2")),
            fetch_from_s3(s3_cache, format!("{match_id}.meta_hltv.bz2")),
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
    }

    rate_limit_client
        .apply_limits(
            rate_limit_key,
            "match_metadata_s3",
            &[
                Quota::ip_limit(100, Duration::from_secs(10)),
                Quota::key_limit(100, Duration::from_secs(1)),
                Quota::global_limit(700, Duration::from_secs(1)), // This is a limitation by Hetzner Object Store
            ],
        )
        .await?;

    // If not in cache, fetch from S3
    let results = join(
        fetch_from_s3(s3, format!("processed/metadata/{match_id}.meta.bz2")),
        fetch_from_s3(s3, format!("processed/metadata/{match_id}.meta_hltv.bz2")),
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
        is_custom,
    )
    .await?;
    Ok(steam_client.fetch_metadata_file(match_id, salts).await?)
}

async fn parse_match_metadata_raw(raw_data: &[u8]) -> APIResult<CMsgMatchMetaDataContents> {
    let mut decompressor = BzDecoder::new(raw_data);
    let mut buf = Vec::with_capacity(decompressor.get_ref().len());
    decompressor.read_to_end(&mut buf).await?;
    let match_data = CMsgMatchMetaData::decode(buf.as_slice())?
        .match_details
        .ok_or_else(|| APIError::internal("Failed to parse match metadata: No data"))?;
    Ok(
        CMsgMatchMetaDataContents::decode(match_data.as_slice()).or_else(|_| {
            CMsgMatchMetaDataContentsPatched::decode(match_data.as_slice())
                .map(|p| p.encode_to_vec())
                .and_then(|p| CMsgMatchMetaDataContents::decode(p.as_slice()))
        })?,
    )
}

#[utoipa::path(
    get,
    path = "/{match_id}/metadata/raw",
    params(MatchIdQuery, MetadataQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = NOT_FOUND, description = "Match metadata not found"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching match metadata failed")
    ),
    tags = ["Matches"],
    summary = "Metadata as Protobuf",
    description = "
This endpoints returns the raw .meta.bz2 file for the given `match_id`.

You have to decompress it and decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgMatchMetaData
- CMsgMatchMetaDataContents

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | From Cache: 100req/s<br>From S3: 100req/10s<br>From Steam: 10req/30mins |
| Key | From Cache: 100req/s<br>From S3: 100req/s<br>From Steam: 10req/min |
| Global | From Cache: 100req/s<br>From S3: 700req/s<br>From Steam: 10req/10s |
    "
)]
pub(super) async fn metadata_raw(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    Query(MetadataQuery { is_custom }): Query<MetadataQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    async fn fetch_from_s3_stream<T: Into<S3Path>>(
        s3: &AmazonS3,
        key: T,
    ) -> object_store::Result<BoxStream<'static, object_store::Result<Bytes>>> {
        s3.get(&key.into()).await.map(GetResult::into_stream)
    }

    if match_id >= *min_cache_match_id(&state.ch_client).await {
        let results = join(
            fetch_from_s3_stream(&state.s3_cache_client, format!("{match_id}.meta.bz2")),
            fetch_from_s3_stream(&state.s3_cache_client, format!("{match_id}.meta_hltv.bz2")),
        )
        .await;
        if let Ok(data) = results.0 {
            debug!("Match metadata found in cache");
            counter!("metadata.fetch", "s3" => "minio", "source" => "salt").increment(1);
            return Ok(Body::from_stream(data));
        }
        if let Ok(data) = results.1 {
            debug!("Match metadata found in cache, hltv");
            counter!("metadata.fetch", "s3" => "minio", "source" => "hltv").increment(1);
            return Ok(Body::from_stream(data));
        }
    }

    fetch_match_metadata_raw(
        &state.rate_limit_client,
        &rate_limit_key,
        &state.steam_client,
        &state.ch_client,
        &state.s3_client,
        None, // Skip cache
        match_id,
        is_custom.unwrap_or_default(),
    )
    .await
    .map(Body::from)
}

#[utoipa::path(
    get,
    path = "/{match_id}/metadata",
    params(MatchIdQuery, MetadataQuery),
    responses(
        (status = OK, description = "Match metadata, see protobuf type: CMsgMatchMetaDataContents"),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = NOT_FOUND, description = "Match metadata not found"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing match metadata failed")
    ),
    tags = ["Matches"],
    summary = "Metadata",
    description = "
This endpoint returns the match metadata for the given `match_id` parsed into JSON.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgMatchMetaData
- CMsgMatchMetaDataContents

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | From Cache: 100req/s<br>From S3: 100req/10s<br>From Steam: 10req/30mins |
| Key | From Cache: 100req/s<br>From S3: 100req/s<br>From Steam: 10req/min |
| Global | From Cache: 100req/s<br>From S3: 700req/s<br>From Steam: 10req/10s |
    "
)]
pub(super) async fn metadata(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    Query(MetadataQuery { is_custom }): Query<MetadataQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let raw_data = fetch_match_metadata_raw(
        &state.rate_limit_client,
        &rate_limit_key,
        &state.steam_client,
        &state.ch_client,
        &state.s3_client,
        Some(&state.s3_cache_client),
        match_id,
        is_custom.unwrap_or_default(),
    )
    .await?;
    parse_match_metadata_raw(&raw_data).await.map(Json)
}
