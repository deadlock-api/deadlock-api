use core::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;
use tryhard::RetryPolicy;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use base64::Engine as _;
use base64::prelude::BASE64_STANDARD;
use cached::macros::cached;
use clickhouse::Row;
use futures::join;
use itertools::Itertools as _;
use serde::Deserialize;
use steam_proxy::{SteamProxyError, SteamProxyReply};
use tracing::warn;
use utoipa::IntoParams;
use valveprotos::deadlock::CMsgClientToGcGetLeaderboardResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::leaderboard::fetch_leaderboard_raw;
use crate::services::leaderboard::types::{Leaderboard, LeaderboardRegion};
use crate::services::rate_limiter::{DOCUMENTED_DEFAULT, describe};

#[derive(Debug, Deserialize, IntoParams)]
pub(super) struct LeaderboardQuery {
    /// The region to fetch the leaderboard for.
    #[serde(default)]
    #[param(inline)]
    region: LeaderboardRegion,
}

#[derive(Debug, Deserialize, IntoParams)]
pub(super) struct LeaderboardHeroQuery {
    /// The region to fetch the leaderboard for.
    #[serde(default)]
    #[param(inline)]
    region: LeaderboardRegion,
    /// The hero ID to fetch the leaderboard for. See more: <https://api.deadlock-api.com/v1/assets/heroes>
    hero_id: u32,
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub(super) struct LeaderboardIdQuery {
    /// Leaderboard to fetch, e.g. a ranked season's `leaderboard_id` from
    /// <https://api.deadlock-api.com/v1/assets/ranked-seasons>. Defaults to the current one.
    leaderboard_id: Option<u32>,
}

#[cached(
    ttl_secs = 86400,
    convert = "{ 0 }",
    key = "u8",
    sync_writes = "default"
)]
async fn fetch_all_steam_names(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<Arc<HashMap<String, Vec<u32>>>> {
    #[derive(serde::Deserialize, Row)]
    struct CHResponse {
        name: String,
        account_id: u32,
    }

    Ok(Arc::new(
        ch_client
            .query(
                "
                SELECT DISTINCT assumeNotNull(name) as name, account_id
                FROM steam_profiles
                ARRAY JOIN [personaname, realname] AS name
                WHERE name IS NOT NULL AND not empty(name)
                SETTINGS log_comment = 'leaderboard'
            ",
            )
            .fetch_all::<CHResponse>()
            .await?
            .into_iter()
            .map(|row| (row.name, row.account_id))
            .into_group_map(),
    ))
}

async fn ensure_valid_hero_id(state: &AppState, hero_id: u32) -> APIResult<()> {
    if state.assets_client.validate_hero_id(hero_id).await {
        Ok(())
    } else {
        Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Invalid hero_id: {hero_id}"),
        ))
    }
}

/// The leaderboard as the raw protobuf message.
async fn fetch_leaderboard_proto(
    state: &AppState,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
    leaderboard_id: Option<u32>,
) -> APIResult<Vec<u8>> {
    let steam_response =
        tryhard::retry_fn(|| fetch_leaderboard_raw(state, region, hero_id, leaderboard_id))
            .retries(3)
            .custom_backoff(|_, e: &SteamProxyError| {
                if e.is_retryable() {
                    RetryPolicy::Delay(Duration::from_millis(10))
                } else {
                    RetryPolicy::Break
                }
            })
            .await?;
    Ok(BASE64_STANDARD.decode(&steam_response.data)?)
}

/// The parsed leaderboard, with each entry's possible account ids looked up by its name.
async fn fetch_leaderboard(
    state: &AppState,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
    leaderboard_id: Option<u32>,
) -> APIResult<Leaderboard> {
    let (raw_leaderboard, steam_names) = join!(
        fetch_leaderboard_raw(state, region, hero_id, leaderboard_id),
        fetch_all_steam_names(&state.ch_client_ro),
    );
    let proto_leaderboard: SteamProxyReply<CMsgClientToGcGetLeaderboardResponse> =
        raw_leaderboard?.try_into()?;
    let mut leaderboard: Leaderboard = proto_leaderboard.msg.try_into()?;
    match steam_names {
        Ok(steam_names) => {
            for entry in &mut leaderboard.entries {
                if let Some(ref account_name) = entry.account_name {
                    entry.possible_account_ids =
                        steam_names.get(account_name).cloned().unwrap_or_default();
                }
            }
        }
        Err(e) => {
            warn!("Failed to fetch steam names: {e}");
        }
    }
    Ok(leaderboard)
}

#[utoipa::path(
    get,
    path = "/{region}/raw",
    params(LeaderboardQuery, LeaderboardIdQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching the leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Leaderboard as Protobuf",
    description = describe(
        "
Returns the leaderboard, serialized as protobuf message.

You have to decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Message:
- CMsgClientToGcGetLeaderboardResponse

### Note:

Valve updates the leaderboard once per hour.

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn leaderboard_raw(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
    Query(LeaderboardIdQuery { leaderboard_id }): Query<LeaderboardIdQuery>,
) -> APIResult<impl IntoResponse> {
    fetch_leaderboard_proto(&state, region, None, leaderboard_id).await
}

#[utoipa::path(
    get,
    path = "/{region}/{hero_id}/raw",
    params(LeaderboardHeroQuery, LeaderboardIdQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching the hero leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Hero Leaderboard as Protobuf",
    description = describe(
        "
Returns the leaderboard for a specific hero, serialized as protobuf message.

You have to decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Message:
- CMsgClientToGcGetLeaderboardResponse

### Note:

Valve updates the leaderboard once per hour.

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn leaderboard_hero_raw(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
    Query(LeaderboardIdQuery { leaderboard_id }): Query<LeaderboardIdQuery>,
) -> APIResult<impl IntoResponse> {
    ensure_valid_hero_id(&state, hero_id).await?;
    fetch_leaderboard_proto(&state, region, Some(hero_id), leaderboard_id).await
}

#[utoipa::path(
    get,
    path = "/{region}",
    params(LeaderboardQuery, LeaderboardIdQuery),
    responses(
        (status = OK, body = Leaderboard),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Leaderboard",
    description = describe(
        "
Returns the leaderboard.

### Note:

Valve updates the leaderboard once per hour.

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn leaderboard(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
    Query(LeaderboardIdQuery { leaderboard_id }): Query<LeaderboardIdQuery>,
) -> APIResult<impl IntoResponse> {
    fetch_leaderboard(&state, region, None, leaderboard_id)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/{region}/{hero_id}",
    params(LeaderboardHeroQuery, LeaderboardIdQuery),
    responses(
        (status = OK, body = Leaderboard),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching or parsing the hero leaderboard failed")
    ),
    tags = ["Leaderboard"],
    summary = "Hero Leaderboard",
    description = describe(
        "
Returns the leaderboard for a specific hero.

### Note:

Valve updates the leaderboard once per hour.

    ",
        DOCUMENTED_DEFAULT,
    )
)]
pub(super) async fn leaderboard_hero(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
    Query(LeaderboardIdQuery { leaderboard_id }): Query<LeaderboardIdQuery>,
) -> APIResult<impl IntoResponse> {
    ensure_valid_hero_id(&state, hero_id).await?;
    fetch_leaderboard(&state, region, Some(hero_id), leaderboard_id)
        .await
        .map(Json)
}
