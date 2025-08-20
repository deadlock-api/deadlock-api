use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use cached::TimedCache;
use cached::proc_macro::cached;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::parse::{comma_separated_deserialize, steamid64_to_steamid3};
use crate::utils::types::AccountIdQuery;

#[derive(Deserialize, IntoParams, Clone)]
pub(crate) struct AccountIdsQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u64>,
}

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub(super) struct SteamSearchQuery {
    /// Search query for Steam profiles.
    search_query: String,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub(super) struct SteamProfile {
    pub(super) account_id: u32,
    pub(super) personaname: String,
    pub(super) profileurl: String,
    pub(super) avatar: String,
    pub(super) avatarmedium: String,
    pub(super) avatarfull: String,
    pub(super) realname: Option<String>,
    pub(super) countrycode: Option<String>,
    #[serde(with = "clickhouse::serde::chrono::datetime")]
    pub(super) last_updated: chrono::DateTime<Utc>,
}

fn build_query(account_id: u32) -> String {
    format!(
        "
        SELECT ?fields
        FROM steam_profiles
        WHERE account_id = {account_id}
        ORDER BY last_updated DESC
        LIMIT 1
         "
    )
}

#[cached(
    ty = "TimedCache<u32, SteamProfile>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60)) }",
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
async fn get_steam(ch_client: &clickhouse::Client, account_id: u32) -> APIResult<SteamProfile> {
    let query = build_query(account_id);
    debug!(?query);
    match ch_client.query(&query).fetch_one().await {
        Ok(profile) => Ok(profile),
        Err(clickhouse::error::Error::RowNotFound) => Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            "Steam profile not found.",
        )),
        Err(e) => {
            warn!("Failed to fetch steam profile for account_id {account_id}: {e}");
            Err(APIError::InternalError {
                message: "Failed to fetch steam profile".to_string(),
            })
        }
    }
}

#[utoipa::path(
    get,
    path = "/{account_id}/steam",
    params(AccountIdQuery),
    responses(
        (status = OK, description = "Steam Profile", body = SteamProfile),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = NOT_FOUND, description = "Steam profile not found."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch steam profile.")
    ),
    tags = ["Players"],
    summary = "Steam Profile",
    description = "
This endpoint returns the Steam profile of a player.

See: https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_(v0002)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn steam(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(AppState { ch_client_ro, .. }): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_steam(&ch_client_ro, account_id).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/steam",
    params(AccountIdsQuery),
    responses(
        (status = OK, description = "Steam Profiles", body = [SteamProfile]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = NOT_FOUND, description = "No Steam profile found."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch steam profiles.")
    ),
    tags = ["Players"],
    summary = "Batch Steam Profile",
    description = "
This endpoint returns Steam profiles of players.

See: https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_(v0002)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn steam_batch(
    Query(AccountIdsQuery { account_ids }): Query<AccountIdsQuery>,
    State(AppState { ch_client_ro, .. }): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let account_ids = account_ids
        .into_iter()
        .filter_map(|s| steamid64_to_steamid3(s).ok())
        .collect::<Vec<_>>();
    if account_ids.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No valid account ids provided.",
        ));
    }
    if account_ids.len() > 1_000 {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Too many account ids provided.",
        ));
    }
    futures::future::join_all(account_ids.into_iter().map(|a| get_steam(&ch_client_ro, a)))
        .await
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
        .map(Json)
}

async fn search_steam(
    ch_client: &clickhouse::Client,
    search_query: String,
) -> APIResult<Vec<SteamProfile>> {
    let query = "
        WITH ? as query
        SELECT ?fields
        FROM steam_profiles FINAL
        WHERE personaname IS NOT NULL AND not empty(personaname)
        ORDER BY if(account_id == toUInt32OrDefault(query), -1, 0),
                 if(toUInt64(account_id) + 76561197960265728 == toUInt64OrDefault(query), -1, 0),
                 jaroWinklerSimilarity(lower(personaname), lower(query)) DESC
        LIMIT 100
    ";
    debug!(?query);
    match ch_client.query(query).bind(&search_query).fetch_all().await {
        Ok(profiles) if !profiles.is_empty() => Ok(profiles),
        Ok(_) => Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            "No Steam profiles found.",
        )),
        Err(e) => {
            warn!("Failed to fetch steam profiles for search query {search_query}: {e}");
            Err(APIError::InternalError {
                message: "Failed to fetch steam profiles".to_string(),
            })
        }
    }
}

#[utoipa::path(
    get,
    path = "/steam-search",
    params(SteamSearchQuery),
    responses(
        (status = OK, description = "Steam Profile Search", body = [SteamProfile]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = NOT_FOUND, description = "No Steam profiles found."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch steam profiles.")
    ),
    tags = ["Players"],
    summary = "Steam Profile Search",
    description = "
This endpoint lets you search for Steam profiles by account_id or personaname.

See: https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_(v0002)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)]
pub(super) async fn steam_search(
    Query(SteamSearchQuery { search_query }): Query<SteamSearchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    search_steam(&state.ch_client_ro, search_query)
        .await
        .map(Json)
}
