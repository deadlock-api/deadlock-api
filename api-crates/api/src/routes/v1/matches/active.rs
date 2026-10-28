use core::time::Duration;
use std::collections::HashSet;
use std::sync::LazyLock;
use std::time::Instant;

use axum::Json;
use axum::extract::State;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use base64::Engine as _;
use base64::prelude::BASE64_STANDARD;
use bytes::Bytes;
use itertools::Itertools as _;
use moka::Expiry;
use moka::future::Cache;
use prost::Message as _;
use serde::Deserialize;
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgClientToGcGetActiveMatches, CMsgClientToGcGetActiveMatchesResponse,
    EgcCitadelClientMessages,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::ActiveMatch;
use crate::services::rate_limiter::{DOCUMENTED_DEFAULT, describe};
use crate::services::steam::types::{SteamProxyQuery, SteamProxyResult};
use crate::utils::parse::{comma_separated_steam_ids_option, parse_steam_id_option};

#[derive(Deserialize, IntoParams)]
pub(super) struct ActiveMatchesQuery {
    /// The account ID to filter active matches by (`SteamID3`)
    #[serde(default, deserialize_with = "parse_steam_id_option")]
    #[deprecated]
    account_id: Option<u32>,
    /// Comma separated list of account ids to include
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(default, deserialize_with = "comma_separated_steam_ids_option")]
    account_ids: Option<Vec<u32>>,
}

/// How long a fetched list is served.
const ACTIVE_MATCHES_TTL: Duration = Duration::from_mins(1);

/// Serves a fetched list for [`ACTIVE_MATCHES_TTL`] and a failure for 5–10 s (longer when Steam
/// asks for a longer wait), so requests during an outage fail fast instead of each retrying Steam.
struct ActiveMatchesExpiry;

impl Expiry<(), SteamProxyResult<Bytes>> for ActiveMatchesExpiry {
    fn expire_after_create(
        &self,
        (): &(),
        value: &SteamProxyResult<Bytes>,
        _: Instant,
    ) -> Option<Duration> {
        Some(match value {
            Ok(_) => ACTIVE_MATCHES_TTL,
            Err(e) => Duration::from_secs(e.retry_after_secs().unwrap_or(0).clamp(5, 10)),
        })
    }
}

static ACTIVE_MATCHES: LazyLock<Cache<(), SteamProxyResult<Bytes>>> = LazyLock::new(|| {
    Cache::builder()
        .max_capacity(1)
        .expire_after(ActiveMatchesExpiry)
        .build()
});

/// The cached active matches. Concurrent misses share a single Steam call and its outcome.
async fn fetch_active_matches_raw(state: &AppState) -> SteamProxyResult<Bytes> {
    ACTIVE_MATCHES
        .get_with((), async {
            let steam_response = state
                .steam_client
                .call_steam_proxy_raw(SteamProxyQuery {
                    msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetActiveMatches,
                    msg: CMsgClientToGcGetActiveMatches::default(),
                    in_all_groups: Some(vec!["LowRateLimitApis".to_owned()]),
                    in_any_groups: None,
                    cooldown_time: Duration::from_mins(10),
                    request_timeout: Duration::from_secs(2),
                    username: None,
                    soft_cooldown_millis: None,
                })
                .await?;
            Ok(BASE64_STANDARD.decode(&steam_response.data)?.into())
        })
        .await
}

fn parse_active_matches_raw(raw_data: &[u8]) -> APIResult<Vec<ActiveMatch>> {
    let Some(compressed) = raw_data.get(7..) else {
        return Err(APIError::internal("Invalid active matches data"));
    };
    let decompressed_data = snap::raw::Decoder::new().decompress_vec(compressed)?;
    let decoded_message =
        CMsgClientToGcGetActiveMatchesResponse::decode(decompressed_data.as_ref())?;
    Ok(decoded_message
        .active_matches
        .into_iter()
        .map_into()
        .collect())
}

#[utoipa::path(
    get,
    path = "/active/raw",
    responses(
        (status = OK, body = [u8]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching active matches failed")
    ),
    tags = ["Matches"],
    summary = "Active as Protobuf",
    description = describe(
        "
Returns active matches that are currently being played, serialized as protobuf message.

Fetched from the watch tab in game, which is limited to the **top 200 matches**.

You have to decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Message:
- CMsgClientToGcGetActiveMatchesResponse

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn active_matches_raw(
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    Ok(fetch_active_matches_raw(&state).await?)
}

#[utoipa::path(
    get,
    path = "/active",
    params(ActiveMatchesQuery),
    responses(
        (status = OK, body = [ActiveMatch]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing active matches failed")
    ),
    tags = ["Matches"],
    summary = "Active",
    description = describe(
        "
Returns active matches that are currently being played.

Fetched from the watch tab in game, which is limited to the **top 200 matches**.

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn active_matches(
    Query(query): Query<ActiveMatchesQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let raw_data = fetch_active_matches_raw(&state).await?;
    let mut active_matches = parse_active_matches_raw(&raw_data)?;

    // Filter by account id if provided
    #[expect(deprecated, reason = "reads the deprecated legacy query parameters")]
    if let Some(account_id) = query.account_id {
        active_matches.retain(|m| m.players.iter().any(|p| p.account_id == Some(account_id)));
    }
    if let Some(account_ids) = query.account_ids {
        let account_ids: HashSet<u32> = account_ids.into_iter().collect();
        active_matches.retain(|m| {
            m.players
                .iter()
                .any(|p| p.account_id.is_some_and(|a| account_ids.contains(&a)))
        });
    }

    Ok(Json(active_matches))
}
