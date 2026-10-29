use core::time::Duration;
use std::sync::LazyLock;

use async_compression::tokio::bufread::{BzDecoder, ZstdDecoder};
use axum::Json;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use bytes::Bytes;
use clickhouse::Row;
use clickhouse_utils::{BatchQueryMulti, ClickhouseBatcherMulti, in_clause};
use futures::future::join;
use futures::stream::BoxStream;
use metrics::counter;
use moka::future::Cache;
use object_store::aws::AmazonS3;
use object_store::local::LocalFileSystem;
use object_store::path::Path as S3Path;
use object_store::{GetResult, ObjectStore, ObjectStoreExt as _};
use prost::Message as _;
use serde::Deserialize;
use tokio::io::AsyncReadExt as _;
use tokio::sync::OnceCell;
use tracing::{debug, error};
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgMatchMetaData, CMsgMatchMetaDataContents, CMsgMatchMetaDataContentsPatched,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::salts::{self, fetch_match_salts};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{DOCUMENTED_DEFAULT, Quota, RateLimit, Scope, describe};
use crate::utils::compression::is_zstd;
use crate::utils::types::MatchIdQuery;

const S3_RATE_LIMIT: RateLimit = RateLimit::new(
    "match_metadata_s3",
    &[
        Quota::new(Scope::Ip, 100, Duration::from_secs(10)),
        Quota::new(Scope::Key, 100, Duration::from_secs(1)),
        Quota::new(Scope::Global, 700, Duration::from_secs(1)), // This is a limitation by Hetzner Object Store
    ],
);

#[derive(Debug, Clone, Row, Deserialize)]
pub(crate) struct DemoPlayerRow {
    match_id: u64,
    account_id: u32,
    hero_build_id: Option<u64>,
    pregame_hero_id: Option<u32>,
    banned_hero_ids: Vec<u8>,
}

pub(crate) struct DemoPlayerQuery;

impl BatchQueryMulti for DemoPlayerQuery {
    type Key = u64;
    type Value = DemoPlayerRow;

    fn build_query(keys: &[u64]) -> String {
        // use_statistics = 0: since 26.8 loading per-part statistics at plan time costs
        // more than it saves on this query (benchmarked 18ms -> 15ms without).
        format!(
            "SELECT match_id, account_id, hero_build_id, pregame_hero_id, banned_hero_ids \
             FROM match_player WHERE match_id IN ({}) AND demo_processed = 1 \
             SETTINGS log_comment = 'metadata_demo_player', use_statistics = 0",
            in_clause(keys)
        )
    }

    fn key_of(value: &DemoPlayerRow) -> u64 {
        value.match_id
    }
}

pub(crate) type DemoPlayerBatcher = ClickhouseBatcherMulti<DemoPlayerQuery>;

/// Wrapper around `CMsgMatchMetaDataContents` that adds hero build IDs from demo analysis.
#[derive(serde::Serialize)]
struct MatchMetadataResponse {
    #[serde(flatten)]
    metadata: CMsgMatchMetaDataContents,
    /// Map of `account_id` to `hero_build_id`.
    /// The `hero_build_id` is the first build the player had selected when the game started.
    /// It does not reflect any build changes made during the match.
    hero_build_ids: std::collections::HashMap<u32, u64>,
    /// Map of `account_id` to the hero the player had locked before the pre-game swap window.
    /// Only present for players where this is known; a player swapped heroes when it differs
    /// from their `hero_id`.
    pregame_hero_ids: std::collections::HashMap<u32, u32>,
    /// List of hero IDs that were banned in this match.
    banned_hero_ids: Vec<u8>,
}

static MIN_MATCH_ID_IN_CACHE: OnceCell<u64> = OnceCell::const_new();

/// Negative cache of match IDs whose metadata fetch from Valve's replay CDN recently failed.
/// Lets retry storms short-circuit instead of repeatedly re-hitting S3 and the (often
/// unavailable) CDN for the same match.
static METADATA_FETCH_FAILURES: LazyLock<NegativeCache> =
    LazyLock::new(|| negative_cache(Duration::from_mins(1)));

/// Negative cache of match IDs whose metadata Valve's replay CDN answered with 404. Unlike
/// transient failures, these rarely resolve quickly, so they are remembered for longer.
static METADATA_NOT_FOUND: LazyLock<NegativeCache> =
    LazyLock::new(|| negative_cache(Duration::from_hours(1)));

type NegativeCache = Cache<u64, ()>;

/// A negative cache of match IDs. Concurrent lookups don't contend on a lock, and expired
/// entries are evicted instead of piling up until their key is looked up again.
fn negative_cache(ttl: Duration) -> NegativeCache {
    Cache::builder()
        .time_to_live(ttl)
        .max_capacity(1_000_000)
        .build()
}

fn is_cached(cache: &NegativeCache, match_id: u64) -> bool {
    cache.contains_key(&match_id)
}

async fn remember(cache: &NegativeCache, match_id: u64) {
    cache.insert(match_id, ()).await;
}

fn metadata_not_found() -> APIError {
    APIError::status_msg(StatusCode::NOT_FOUND, "Match metadata not found.")
}

async fn min_cache_match_id(ch_client: &clickhouse::Client) -> &u64 {
    MIN_MATCH_ID_IN_CACHE
        .get_or_init(|| async { ch_client
            .query("SELECT min(match_id) FROM match_player WHERE start_time > now() - INTERVAL 2 WEEK SETTINGS log_comment = 'metadata_min_cache_match_id', apply_patch_parts = 0")
            .fetch_one()
            .await
            .unwrap_or_default() })
        .await
}

#[derive(Deserialize, IntoParams)]
pub(super) struct MetadataQuery {
    is_custom: Option<bool>,
    /// If `true`, skip the Steam fallback when the metadata is not available in S3
    /// and return an error instead.
    disable_steam: Option<bool>,
}

async fn fetch_from_s3<T: Into<S3Path>>(
    s3: &impl ObjectStore,
    key: T,
) -> object_store::Result<Bytes> {
    s3.get(&key.into()).await?.bytes().await
}

/// Fetches the salt-based `{prefix}{match_id}.meta.bz2`, else its `.meta_hltv.bz2` counterpart (both
/// are requested concurrently), counting the hit under `store`. `None` when neither exists.
async fn fetch_salt_or_hltv<T, F: Future<Output = object_store::Result<T>>>(
    match_id: u64,
    prefix: &str,
    store: &'static str,
    fetch: impl Fn(String) -> F,
) -> Option<T> {
    let (source, data) = match join(
        fetch(format!("{prefix}{match_id}.meta.bz2")),
        fetch(format!("{prefix}{match_id}.meta_hltv.bz2")),
    )
    .await
    {
        (Ok(data), _) => ("salt", data),
        (_, Ok(data)) => ("hltv", data),
        (Err(salt_err), Err(hltv_err)) => {
            debug!(
                match_id,
                store,
                salt_err = %salt_err,
                hltv_err = %hltv_err,
                "Match metadata not found"
            );
            return None;
        }
    };
    debug!(match_id, store, source, "Match metadata found");
    counter!("metadata.fetch", "s3" => store, "source" => source).increment(1);
    Some(data)
}

async fn fetch_match_metadata_raw(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    s3: &AmazonS3,
    file_cache: Option<&LocalFileSystem>,
    match_id: u64,
    is_custom: bool,
    disable_steam: bool,
) -> APIResult<Bytes> {
    if is_cached(&METADATA_NOT_FOUND, match_id) {
        return Err(metadata_not_found());
    }
    if is_cached(&METADATA_FETCH_FAILURES, match_id) {
        return Err(APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "Match metadata recently failed to fetch from upstream. Retry later.",
        ));
    }

    // Try to fetch from the cache first. The `s3-cache` metric label predates the file cache and is
    // kept so dashboards keep their history.
    if match_id >= *min_cache_match_id(&state.ch_client).await
        && let Some(file_cache) = file_cache
        && let Some(data) = fetch_salt_or_hltv(match_id, "", "s3-cache", |key| {
            fetch_from_s3(file_cache, key)
        })
        .await
    {
        return Ok(data);
    }

    state
        .rate_limit_client
        .check(rate_limit_key, S3_RATE_LIMIT)
        .await?;

    // If not in cache, fetch from S3
    if let Some(data) = fetch_salt_or_hltv(match_id, "processed/metadata/", "hetzner", |key| {
        fetch_from_s3(s3, key)
    })
    .await
    {
        return Ok(data);
    }

    // If not in S3, fetch from Steam
    let salts = fetch_match_salts(state, rate_limit_key, match_id, is_custom, disable_steam)
        .await?
        .salts;
    match state
        .steam_client
        .fetch_metadata_file(match_id, salts)
        .await
    {
        Ok(metadata) => Ok(metadata.into()),
        Err(e) if e.status() == Some(StatusCode::NOT_FOUND) => {
            remember(&METADATA_NOT_FOUND, match_id).await;
            Err(metadata_not_found())
        }
        Err(e) => {
            remember(&METADATA_FETCH_FAILURES, match_id).await;
            Err(e.into())
        }
    }
}

/// Decompress a `.meta.bz2` payload, sniffing the container from its magic bytes.
///
/// Valve kept the `.meta.bz2` name but switched the actual compression to zstd for newer
/// matches, so the file extension is not a reliable signal.
async fn decompress_metadata(raw_data: &[u8]) -> APIResult<Vec<u8>> {
    let mut buf = Vec::with_capacity(raw_data.len());
    if is_zstd(raw_data) {
        ZstdDecoder::new(raw_data).read_to_end(&mut buf).await?;
    } else {
        BzDecoder::new(raw_data).read_to_end(&mut buf).await?;
    }
    Ok(buf)
}

async fn parse_match_metadata_raw(raw_data: &[u8]) -> APIResult<CMsgMatchMetaDataContents> {
    let buf = decompress_metadata(raw_data).await?;
    let match_data = CMsgMatchMetaData::decode(buf.as_slice())?
        .match_details
        .ok_or_else(|| APIError::internal("Failed to parse match metadata: No data"))?;
    if let Ok(data) = CMsgMatchMetaDataContents::decode(match_data.as_slice()) {
        return Ok(data);
    }

    let patched = CMsgMatchMetaDataContentsPatched::decode(match_data.as_slice())
        .or_else(|_| CMsgMatchMetaDataContentsPatched::decode(buf.as_slice()))
        .inspect_err(|e| debug!("Failed to decode patched metadata: {e}"))?;
    CMsgMatchMetaDataContents::decode(patched.encode_to_vec().as_slice())
        .inspect_err(|e| error!("Failed to decode metadata after patch: {e}"))
        .map_err(Into::into)
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
    description = describe(
        "
This endpoints returns the raw .meta.bz2 file for the given `match_id`.

You have to decompress it and decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgMatchMetaData
- CMsgMatchMetaDataContents

    ",
        [
            ("From cache", DOCUMENTED_DEFAULT),
            ("From S3", S3_RATE_LIMIT.quotas),
            ("From Steam", salts::RATE_LIMIT.quotas),
        ],
    )
)]
pub(super) async fn metadata_raw(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    Query(MetadataQuery {
        is_custom,
        disable_steam,
    }): Query<MetadataQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    async fn fetch_from_s3_stream<T: Into<S3Path>>(
        s3: &impl ObjectStore,
        key: T,
    ) -> object_store::Result<BoxStream<'static, object_store::Result<Bytes>>> {
        s3.get(&key.into()).await.map(GetResult::into_stream)
    }

    if let Some(file_cache) = &state.file_cache
        && match_id >= *min_cache_match_id(&state.ch_client).await
        && let Some(data) = fetch_salt_or_hltv(match_id, "", "s3-cache", |key| {
            fetch_from_s3_stream(file_cache, key)
        })
        .await
    {
        return Ok(Body::from_stream(data));
    }

    fetch_match_metadata_raw(
        &state,
        &rate_limit_key,
        &state.s3_client,
        None, // Skip cache
        match_id,
        is_custom.unwrap_or_default(),
        disable_steam.unwrap_or_default(),
    )
    .await
    .map(Body::from)
}

#[utoipa::path(
    get,
    path = "/{match_id}/metadata",
    params(MatchIdQuery, MetadataQuery),
    responses(
        (status = OK, body = Object, description = "Match metadata, see protobuf type: CMsgMatchMetaDataContents"),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = NOT_FOUND, description = "Match metadata not found"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing match metadata failed")
    ),
    tags = ["Matches"],
    summary = "Metadata",
    description = describe(
        "
This endpoint returns the match metadata for the given `match_id` parsed into JSON.

Each player object is enriched with a `hero_build_id` field (if available) from demo analysis.

> **Note:** The `hero_build_id` represents the first build the player had selected when the game started. It does not reflect any build changes made during the match.

`pregame_hero_ids` maps `account_id` to the hero the player had locked before the pre-game swap window (if available from demo analysis). A player swapped heroes when it differs from their `hero_id`.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgMatchMetaData
- CMsgMatchMetaDataContents

    ",
        [
            ("From cache", DOCUMENTED_DEFAULT),
            ("From S3", S3_RATE_LIMIT.quotas),
            ("From Steam", salts::RATE_LIMIT.quotas),
        ],
    )
)]
pub(super) async fn metadata(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    Query(MetadataQuery {
        is_custom,
        disable_steam,
    }): Query<MetadataQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let raw_data = fetch_match_metadata_raw(
        &state,
        &rate_limit_key,
        &state.s3_client,
        state.file_cache.as_ref(),
        match_id,
        is_custom.unwrap_or_default(),
        disable_steam.unwrap_or_default(),
    )
    .await?;
    let (metadata, demo_rows) = tokio::join!(parse_match_metadata_raw(&raw_data), async {
        state
            .batchers
            .demo_player
            .load(match_id)
            .await
            .unwrap_or_default()
    });

    let pregame_hero_ids = demo_rows
        .iter()
        .filter_map(|r| r.pregame_hero_id.map(|h| (r.account_id, h)))
        .collect();
    let hero_build_ids = demo_rows
        .iter()
        .filter_map(|r| r.hero_build_id.map(|b| (r.account_id, b)))
        .collect();
    let banned_hero_ids = demo_rows
        .into_iter()
        .next()
        .map_or_default(|r| r.banned_hero_ids);

    Ok(Json(MatchMetadataResponse {
        metadata: metadata?,
        hero_build_ids,
        pregame_hero_ids,
        banned_hero_ids,
    }))
}
