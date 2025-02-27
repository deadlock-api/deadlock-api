use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::routes::v1::leaderboard::types::{Leaderboard, LeaderboardRegion};
use crate::state::AppState;
use crate::utils;
use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use prost::Message;
use serde::Deserialize;
use std::time::Duration;
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgClientToGcGetLeaderboard, CMsgClientToGcGetLeaderboardResponse, EgcCitadelClientMessages,
};

#[derive(Debug, Deserialize, IntoParams)]
pub struct LeaderboardQuery {
    #[serde(default)]
    #[param(inline)]
    pub region: LeaderboardRegion,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct LeaderboardHeroQuery {
    #[serde(default)]
    #[param(inline)]
    pub region: LeaderboardRegion,
    pub hero_id: u32,
}

#[cached(
    ty = "TimedCache<String, Vec<u8>>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = r#"{ format!("{:?}-{:?}", region, hero_id) }"#,
    sync_writes = true
)]
async fn fetch_leaderboard_raw(
    config: &Config,
    http_client: &reqwest::Client,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
) -> APIResult<Vec<u8>> {
    let msg = CMsgClientToGcGetLeaderboard {
        leaderboard_region: Some(region as i32),
        hero_id,
    };
    utils::steam::call_steam_proxy(
        config,
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetLeaderboard,
        msg,
        &["LowRateLimitApis"],
        Duration::from_secs(60),
        Duration::from_secs(2),
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to fetch active matches: {}", e),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode active matches: {}", e),
            })
    })
}

async fn parse_leaderboard_raw(raw_data: &[u8]) -> APIResult<Leaderboard> {
    CMsgClientToGcGetLeaderboardResponse::decode(raw_data)
        .map(|r| r.into())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to parse active matches: {}", e),
        })
}

#[utoipa::path(
    get,
    path = "/{region}/raw",
    params(LeaderboardQuery),
    responses(
        (status = OK, body = [u8]),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching the leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Leaderboard as Protobuf",
    description = "Returns the leaderboard as protobuf message"
)]
pub async fn leaderboard_raw(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
) -> APIResult<impl IntoResponse> {
    tryhard::retry_fn(|| fetch_leaderboard_raw(&state.config, &state.http_client, region, None))
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
        (status = INTERNAL_SERVER_ERROR, description = "Fetching the hero leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Hero Leaderboard as Protobuf",
    description = "Returns the leaderboard for a specific hero"
)]
pub async fn leaderboard_hero_raw(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
) -> APIResult<impl IntoResponse> {
    tryhard::retry_fn(|| {
        fetch_leaderboard_raw(&state.config, &state.http_client, region, Some(hero_id))
    })
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
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Leaderboard",
    description = "Returns the leaderboard"
)]
pub async fn leaderboard(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
) -> APIResult<impl IntoResponse> {
    let raw_data = tryhard::retry_fn(|| {
        fetch_leaderboard_raw(&state.config, &state.http_client, region, None)
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await?;
    parse_leaderboard_raw(&raw_data).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/{region}/{hero_id}",
    params(LeaderboardHeroQuery),
    responses(
        (status = OK, body = Leaderboard),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the hero leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Hero Leaderboard",
    description = "Returns the leaderboard for a specific hero"
)]
pub async fn leaderboard_hero(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
) -> APIResult<impl IntoResponse> {
    let raw_data = tryhard::retry_fn(|| {
        fetch_leaderboard_raw(&state.config, &state.http_client, region, Some(hero_id))
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await?;
    parse_leaderboard_raw(&raw_data).await.map(Json)
}
