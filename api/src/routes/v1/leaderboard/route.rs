use core::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::macros::cached;
use clickhouse::{Row, RowOwned, RowWrite};
use futures::join;
use itertools::Itertools;
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
    SteamProxyError, SteamProxyQuery, SteamProxyRawResponse, SteamProxyResponse,
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
    ttl_secs = 600,
    convert = "{ (region, hero_id, leaderboard_id) }",
    key = "(LeaderboardRegion, Option<u32>, Option<u32>)"
)]
pub(crate) async fn fetch_leaderboard_raw(
    steam_client: &SteamClient,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
    leaderboard_id: Option<u32>,
) -> Result<SteamProxyRawResponse, SteamProxyError> {
    let msg = CMsgClientToGcGetLeaderboard {
        leaderboard_region: Some(region as i32),
        hero_id,
        leaderboard_id,
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

/// Snapshots the current leaderboard into `leaderboard`, or a hero's into `hero_leaderboard`, in
/// the background. Failures are only logged.
fn spawn_snapshot(
    ch_client: clickhouse::Client,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
    entries: Vec<c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry>,
) {
    tokio::spawn(async move {
        #[expect(clippy::cast_possible_truncation)]
        let Ok(now) = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as u32)
        else {
            warn!("Failed to get current time");
            return;
        };

        // Positions count every entry, also those without a rank, which are not stored.
        #[expect(clippy::cast_possible_truncation)]
        let ranked = entries
            .iter()
            .enumerate()
            .filter_map(|(i, entry)| Some(((i as u32) + 1, entry.rank?, entry)));
        let top_hero_ids =
            |entry: &c_msg_client_to_gc_get_leaderboard_response::LeaderboardEntry| {
                entry
                    .top_hero_ids
                    .iter()
                    .map(|&h| u8::try_from(h).unwrap_or_default())
                    .collect()
            };
        match hero_id {
            None => {
                let rows =
                    ranked.map(
                        |(leaderboard_position, rank, entry)| LeaderboardClickhouse {
                            fetched_at: now,
                            region: region as i8,
                            account_name: entry.account_name.clone(),
                            rank,
                            leaderboard_position,
                            top_hero_ids: top_hero_ids(entry),
                        },
                    );
                insert_rows(&ch_client, "leaderboard", rows).await;
            }
            Some(hero_id) => {
                let rows =
                    ranked.map(
                        |(leaderboard_position, rank, entry)| HeroLeaderboardClickhouse {
                            fetched_at: now,
                            region: region as i8,
                            hero_id: u8::try_from(hero_id).unwrap_or_default(),
                            account_name: entry.account_name.clone(),
                            rank,
                            leaderboard_position,
                            top_hero_ids: top_hero_ids(entry),
                        },
                    );
                insert_rows(&ch_client, "hero_leaderboard", rows).await;
            }
        }
    });
}

async fn insert_rows<R: RowOwned + RowWrite>(
    ch_client: &clickhouse::Client,
    table: &str,
    rows: impl Iterator<Item = R>,
) {
    let Ok(mut inserter) = ch_client.insert::<R>(table).await else {
        warn!("Failed to create inserter for {table}");
        return;
    };
    for row in rows {
        if let Err(e) = inserter.write(&row).await {
            warn!("Failed to write {table} entry to CH: {e}");
            return;
        }
    }
    if let Err(e) = inserter.end().await {
        warn!("Failed to insert {table} to CH: {e}");
    }
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

/// The leaderboard as the raw protobuf message. The current leaderboard is also snapshotted.
async fn fetch_leaderboard_proto(
    state: &AppState,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
    leaderboard_id: Option<u32>,
) -> APIResult<Vec<u8>> {
    let steam_response = tryhard::retry_fn(|| {
        fetch_leaderboard_raw(&state.steam_client, region, hero_id, leaderboard_id)
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await?;
    let decoded = BASE64_STANDARD.decode(&steam_response.data)?;
    // Snapshots track the current leaderboard only; other leaderboards would mix seasons.
    if leaderboard_id.is_none()
        && let Ok(proto) = CMsgClientToGcGetLeaderboardResponse::decode(decoded.as_slice())
    {
        spawn_snapshot(state.ch_client.clone(), region, hero_id, proto.entries);
    }
    Ok(decoded)
}

/// The parsed leaderboard, with each entry's possible account ids looked up by its name. The
/// current leaderboard is also snapshotted.
async fn fetch_leaderboard(
    state: &AppState,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
    leaderboard_id: Option<u32>,
) -> APIResult<Leaderboard> {
    let (raw_leaderboard, steam_names) = join!(
        fetch_leaderboard_raw(&state.steam_client, region, hero_id, leaderboard_id),
        fetch_all_steam_names(&state.ch_client_ro),
    );
    let proto_leaderboard: SteamProxyResponse<CMsgClientToGcGetLeaderboardResponse> =
        raw_leaderboard?.try_into()?;
    // Snapshots track the current leaderboard only; other leaderboards would mix seasons.
    if leaderboard_id.is_none() {
        spawn_snapshot(
            state.ch_client.clone(),
            region,
            hero_id,
            proto_leaderboard.msg.entries.clone(),
        );
    }
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
    Query(LeaderboardIdQuery { leaderboard_id }): Query<LeaderboardIdQuery>,
) -> APIResult<impl IntoResponse> {
    ensure_valid_hero_id(&state, hero_id).await?;
    fetch_leaderboard(&state, region, Some(hero_id), leaderboard_id)
        .await
        .map(Json)
}
