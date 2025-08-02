use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub(super) struct SteamSearchQuery {
    /// Search query for Steam profiles.
    search_query: String,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
struct SteamProfile {
    account_id: u32,
    personaname: String,
    profileurl: String,
    avatar: String,
    realname: Option<String>,
    countrycode: Option<String>,
    #[serde(with = "clickhouse::serde::chrono::datetime")]
    last_updated: chrono::DateTime<Utc>,
}

async fn search_steam(
    ch_client: &clickhouse::Client,
    search_query: String,
) -> APIResult<Vec<SteamProfile>> {
    let query = "
        SELECT ?fields
        FROM steam_profiles
        WHERE hasSubsequence(lower(personaname), lower(?))
            OR hasSubsequence(toString(account_id), lower(?))
            OR hasSubsequence(toString(toUInt64(account_id) + 76561197960265728), lower(?))
        ORDER BY least(
            editDistanceUTF8(lower(personaname), lower(?)),
            editDistanceUTF8(toString(account_id), lower(?)),
            editDistanceUTF8(toString(toUInt64(account_id) + 76561197960265728), lower(?))
        )
        LIMIT 1 BY account_id
        LIMIT 100
    ";
    debug!(?query);
    match ch_client
        .query(query)
        .bind(&search_query)
        .bind(&search_query)
        .bind(&search_query)
        .bind(&search_query)
        .bind(&search_query)
        .bind(&search_query)
        .fetch_all()
        .await
    {
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
