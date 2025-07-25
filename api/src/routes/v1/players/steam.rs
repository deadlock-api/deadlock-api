use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub(super) struct SteamProfile {
    account_id: u32,
    personaname: String,
    profileurl: String,
    avatar: String,
    realname: Option<String>,
    countrycode: Option<String>,
    #[serde(with = "clickhouse::serde::chrono::datetime")]
    last_updated: chrono::DateTime<Utc>,
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
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60 * 60)) }",
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
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_steam(&state.ch_client_ro, account_id).await.map(Json)
}
