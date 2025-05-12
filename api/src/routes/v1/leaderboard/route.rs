use crate::error::{APIError, APIResult};
use crate::routes::v1::leaderboard::types::{Leaderboard, LeaderboardRegion};
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyQuery;
use crate::state::AppState;
use crate::utils::parse;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use prost::Message;
use serde::Deserialize;
use std::time::Duration;
use utoipa::IntoParams;
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response::EResult::KEResultSuccess;
use valveprotos::deadlock::{
    CMsgClientToGcGetLeaderboard, CMsgClientToGcGetLeaderboardResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_get_leaderboard_response,
};

#[derive(Debug, Deserialize, IntoParams)]
pub struct LeaderboardQuery {
    /// The region to fetch the leaderboard for.
    #[serde(default)]
    #[param(inline)]
    pub region: LeaderboardRegion,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct LeaderboardHeroQuery {
    /// The region to fetch the leaderboard for.
    #[serde(default)]
    #[param(inline)]
    pub region: LeaderboardRegion,
    /// The hero ID to fetch the leaderboard for.
    pub hero_id: u32,
}

#[cached(
    ty = "TimedCache<(LeaderboardRegion, Option<u32>), Vec<u8>>",
    create = "{ TimedCache::with_lifespan(10 * 60) }",
    result = true,
    convert = "{ (region, hero_id) }",
    sync_writes = "by_key",
    key = "(LeaderboardRegion, Option<u32>)"
)]
pub async fn fetch_leaderboard_raw(
    steam_client: &SteamClient,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
) -> APIResult<Vec<u8>> {
    let msg = CMsgClientToGcGetLeaderboard {
        leaderboard_region: Some(region as i32),
        hero_id,
    };
    steam_client
        .call_steam_proxy(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetLeaderboard,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_secs(60),
            request_timeout: Duration::from_secs(2),
            username: None,
        })
        .await
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to fetch leaderboard: {e}"),
        })
        .and_then(|r| {
            BASE64_STANDARD
                .decode(&r.data)
                .map_err(|e| APIError::InternalError {
                    message: format!("Failed to decode leaderboard: {e}"),
                })
        })
}

pub async fn parse_leaderboard_raw(raw_data: &[u8]) -> APIResult<Leaderboard> {
    let decoded_message = CMsgClientToGcGetLeaderboardResponse::decode(raw_data).map_err(|e| {
        APIError::InternalError {
            message: format!("Failed to parse leaderboard: {e}"),
        }
    })?;

    if decoded_message
        .result
        .is_none_or(|r| r != c_msg_client_to_gc_get_leaderboard_response::EResult::KESuccess as i32)
    {
        return Err(APIError::InternalError {
            message: format!("Failed to fetch leaderbaord: {KEResultSuccess:?}"),
        });
    }
    Ok(decoded_message.into())
}

pub async fn fetch_parse_leaderboard(
    steam_client: &SteamClient,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
) -> APIResult<Leaderboard> {
    tryhard::retry_fn(|| async {
        let raw_data = fetch_leaderboard_raw(steam_client, region, hero_id).await?;
        parse_leaderboard_raw(&raw_data).await
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await
}

#[utoipa::path(
    get,
    path = "/{region}/raw",
    params(LeaderboardQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching the leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Leaderboard as Protobuf",
    description = r#"
Returns the leaderboard, serialized as protobuf message.
    "#
)]
pub async fn leaderboard_raw(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
) -> APIResult<impl IntoResponse> {
    tryhard::retry_fn(|| fetch_leaderboard_raw(&state.steam_client, region, None))
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await
}

#[utoipa::path(
    get,
    path = "/{region}/{hero_id}/raw",
    params(LeaderboardHeroQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching the hero leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Hero Leaderboard as Protobuf",
    description = r#"
Returns the leaderboard for a specific hero, serialized as protobuf message.
    "#
)]
pub async fn leaderboard_hero_raw(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
) -> APIResult<impl IntoResponse> {
    if !parse::validate_hero_id(&state.http_client, hero_id).await {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: format!("Invalid hero_id: {hero_id}"),
        });
    }
    tryhard::retry_fn(|| fetch_leaderboard_raw(&state.steam_client, region, Some(hero_id)))
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await
}

#[utoipa::path(
    get,
    path = "/{region}",
    params(LeaderboardQuery),
    responses(
        (status = OK, body = Leaderboard),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Leaderboard",
    description = r#"
Returns the leaderboard.
    "#
)]
pub async fn leaderboard(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
) -> APIResult<impl IntoResponse> {
    fetch_parse_leaderboard(&state.steam_client, region, None)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/{region}/{hero_id}",
    params(LeaderboardHeroQuery),
    responses(
        (status = OK, body = Leaderboard),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the hero leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Hero Leaderboard",
    description = r#"
Returns the leaderboard for a specific hero.
    "#
)]
pub async fn leaderboard_hero(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
) -> APIResult<impl IntoResponse> {
    if !parse::validate_hero_id(&state.http_client, hero_id).await {
        return Err(APIError::StatusMsg {
            status: StatusCode::BAD_REQUEST,
            message: format!("Invalid hero_id: {hero_id}"),
        });
    }
    fetch_parse_leaderboard(&state.steam_client, region, Some(hero_id))
        .await
        .map(Json)
}
