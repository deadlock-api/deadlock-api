use core::time::Duration;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use futures::join;
use prost::Message;
use serde::Deserialize;
use tracing::warn;
use utoipa::IntoParams;
use valveprotos::deadlock::{
    CMsgClientToGcGetLeaderboard, CMsgClientToGcGetLeaderboardResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_get_leaderboard_response,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::leaderboard::types::{
    HeroLeaderboardClickhouse, Leaderboard, LeaderboardClickhouse, LeaderboardRegion,
};
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::{
    SteamProxyQuery, SteamProxyRawResponse, SteamProxyResponse, SteamProxyResult,
};

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
    /// The hero ID to fetch the leaderboard for. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u32,
}

#[cached(
    ty = "TimedCache<(LeaderboardRegion, Option<u32>), SteamProxyRawResponse>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(10 * 60)) }",
    result = true,
    convert = "{ (region, hero_id) }",
    sync_writes = "by_key",
    key = "(LeaderboardRegion, Option<u32>)"
)]
pub(crate) async fn fetch_leaderboard_raw(
    steam_client: &SteamClient,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
) -> SteamProxyResult<SteamProxyRawResponse> {
    let msg = CMsgClientToGcGetLeaderboard {
        leaderboard_region: Some(region as i32),
        hero_id,
    };
    steam_client
        .call_steam_proxy_raw(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetLeaderboard,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_mins(1),
            request_timeout: Duration::from_secs(2),
            soft_cooldown_millis: None,
            username: None,
        })
        .await
}

#[cached(
    ty = "TimedCache<u8, HashMap<String, Vec<u32>>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(24 * 60 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn fetch_all_steam_names(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<HashMap<String, Vec<u32>>> {
    #[derive(serde::Deserialize, Row)]
    struct CHResponse {
        name: String,
        account_id: u32,
    }

    let mut out = HashMap::new();
    let results = ch_client
        .query(
            "
                SELECT DISTINCT assumeNotNull(name) as name, account_id
                FROM steam_profiles
                ARRAY JOIN [personaname, realname] AS name
                WHERE name IS NOT NULL AND not empty(name)
            ",
        )
        .fetch_all::<CHResponse>()
        .await?;
    for row in results {
        out.entry(row.name)
            .or_insert_with(Vec::new)
            .push(row.account_id);
    }
    Ok(out)
}

async fn insert_leaderboard_to_ch(
    ch_client: &clickhouse::Client,
    region: LeaderboardRegion,
    entries: &[c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry],
) {
    #[allow(clippy::cast_possible_truncation)]
    let Ok(now) = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
    else {
        warn!("Failed to get current time");
        return;
    };

    let Ok(mut inserter) = ch_client
        .insert::<LeaderboardClickhouse>("leaderboard")
        .await
    else {
        warn!("Failed to create inserter for leaderboard");
        return;
    };

    for (i, entry) in entries.iter().enumerate() {
        let Some(rank) = entry.rank else {
            continue;
        };
        let row = LeaderboardClickhouse {
            fetched_at: now,
            region: region as i8,
            account_name: entry.account_name.clone(),
            rank,
            #[allow(clippy::cast_possible_truncation)]
            leaderboard_position: (i as u32) + 1,
            top_hero_ids: entry.top_hero_ids.clone(),
            badge_level: entry.badge_level,
        };
        if let Err(e) = inserter.write(&row).await {
            warn!("Failed to write leaderboard entry to CH: {e}");
            return;
        }
    }
    if let Err(e) = inserter.end().await {
        warn!("Failed to insert leaderboard to CH: {e}");
    }
}

async fn insert_hero_leaderboard_to_ch(
    ch_client: &clickhouse::Client,
    region: LeaderboardRegion,
    hero_id: u32,
    entries: &[c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry],
) {
    #[allow(clippy::cast_possible_truncation)]
    let Ok(now) = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
    else {
        warn!("Failed to get current time");
        return;
    };

    let Ok(mut inserter) = ch_client
        .insert::<HeroLeaderboardClickhouse>("hero_leaderboard")
        .await
    else {
        warn!("Failed to create inserter for hero_leaderboard");
        return;
    };

    for (i, entry) in entries.iter().enumerate() {
        let Some(rank) = entry.rank else {
            continue;
        };
        let row = HeroLeaderboardClickhouse {
            fetched_at: now,
            region: region as i8,
            hero_id,
            account_name: entry.account_name.clone(),
            rank,
            #[allow(clippy::cast_possible_truncation)]
            leaderboard_position: (i as u32) + 1,
            top_hero_ids: entry.top_hero_ids.clone(),
            badge_level: entry.badge_level,
        };
        if let Err(e) = inserter.write(&row).await {
            warn!("Failed to write hero_leaderboard entry to CH: {e}");
            return;
        }
    }
    if let Err(e) = inserter.end().await {
        warn!("Failed to insert hero_leaderboard to CH: {e}");
    }
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
    description = "
Returns the leaderboard, serialized as protobuf message.

You have to decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Message:
- CMsgClientToGcGetLeaderboardResponse

### Note:

Valve updates the leaderboard once per hour.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn leaderboard_raw(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
) -> APIResult<impl IntoResponse> {
    let steam_response =
        tryhard::retry_fn(|| fetch_leaderboard_raw(&state.steam_client, region, None))
            .retries(3)
            .fixed_backoff(Duration::from_millis(10))
            .await?;
    let decoded = BASE64_STANDARD.decode(&steam_response.data)?;
    if let Ok(proto) = CMsgClientToGcGetLeaderboardResponse::decode(decoded.as_slice()) {
        let ch_client = state.ch_client.clone();
        tokio::spawn(async move {
            insert_leaderboard_to_ch(&ch_client, region, &proto.entries).await;
        });
    }
    Ok(decoded)
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
    description = "
Returns the leaderboard for a specific hero, serialized as protobuf message.

You have to decode the protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Message:
- CMsgClientToGcGetLeaderboardResponse

### Note:

Valve updates the leaderboard once per hour.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn leaderboard_hero_raw(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
) -> APIResult<impl IntoResponse> {
    if !state.assets_client.validate_hero_id(hero_id).await {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Invalid hero_id: {hero_id}"),
        ));
    }
    let steam_response =
        tryhard::retry_fn(|| fetch_leaderboard_raw(&state.steam_client, region, Some(hero_id)))
            .retries(3)
            .fixed_backoff(Duration::from_millis(10))
            .await?;
    let decoded = BASE64_STANDARD.decode(&steam_response.data)?;
    if let Ok(proto) = CMsgClientToGcGetLeaderboardResponse::decode(decoded.as_slice()) {
        let ch_client = state.ch_client.clone();
        tokio::spawn(async move {
            insert_hero_leaderboard_to_ch(&ch_client, region, hero_id, &proto.entries).await;
        });
    }
    Ok(decoded)
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
    description = "
Returns the leaderboard.

### Note:

Valve updates the leaderboard once per hour.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn leaderboard(
    State(state): State<AppState>,
    Path(LeaderboardQuery { region }): Path<LeaderboardQuery>,
) -> APIResult<impl IntoResponse> {
    let (raw_leaderboard, steam_names) = join!(
        fetch_leaderboard_raw(&state.steam_client, region, None),
        fetch_all_steam_names(&state.ch_client_ro),
    );
    let proto_leaderboard: SteamProxyResponse<CMsgClientToGcGetLeaderboardResponse> =
        raw_leaderboard?.try_into()?;
    let ch_client = state.ch_client.clone();
    let entries = proto_leaderboard.msg.entries.clone();
    tokio::spawn(async move {
        insert_leaderboard_to_ch(&ch_client, region, &entries).await;
    });
    let mut leaderboard: APIResult<Leaderboard> = proto_leaderboard.msg.try_into();
    match steam_names {
        Ok(steam_names) => {
            if let Ok(leaderboard) = &mut leaderboard {
                for entry in &mut leaderboard.entries {
                    if let Some(ref account_name) = entry.account_name {
                        entry.possible_account_ids =
                            steam_names.get(account_name).cloned().unwrap_or_default();
                    }
                }
            }
        }
        Err(e) => {
            warn!("Failed to fetch steam names: {e}");
        }
    }
    leaderboard.map(Json)
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
    description = "
Returns the leaderboard for a specific hero.

### Note:

Valve updates the leaderboard once per hour.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn leaderboard_hero(
    State(state): State<AppState>,
    Path(LeaderboardHeroQuery { region, hero_id }): Path<LeaderboardHeroQuery>,
) -> APIResult<impl IntoResponse> {
    if !state.assets_client.validate_hero_id(hero_id).await {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Invalid hero_id: {hero_id}"),
        ));
    }
    let (raw_leaderboard, steam_names) = join!(
        fetch_leaderboard_raw(&state.steam_client, region, hero_id.into()),
        fetch_all_steam_names(&state.ch_client_ro),
    );
    let proto_leaderboard: SteamProxyResponse<CMsgClientToGcGetLeaderboardResponse> =
        raw_leaderboard?.try_into()?;
    let ch_client = state.ch_client.clone();
    let entries = proto_leaderboard.msg.entries.clone();
    tokio::spawn(async move {
        insert_hero_leaderboard_to_ch(&ch_client, region, hero_id, &entries).await;
    });
    let mut leaderboard: APIResult<Leaderboard> = proto_leaderboard.msg.try_into();
    match steam_names {
        Ok(steam_names) => {
            if let Ok(leaderboard) = &mut leaderboard {
                for entry in &mut leaderboard.entries {
                    if let Some(ref account_name) = entry.account_name {
                        entry.possible_account_ids =
                            steam_names.get(account_name).cloned().unwrap_or_default();
                    }
                }
            }
        }
        Err(e) => {
            warn!("Failed to fetch steam names: {e}");
        }
    }
    leaderboard.map(Json)
}
