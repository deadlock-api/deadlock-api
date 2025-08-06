use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;
use tracing::{debug, warn};
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::steam::SteamProfile;

#[derive(Debug, Clone, Deserialize, IntoParams, Eq, PartialEq, Hash)]
pub(super) struct SteamSearchQuery {
    /// Search query for Steam profiles.
    search_query: String,
}

async fn search_steam(
    ch_client: &clickhouse::Client,
    search_query: String,
) -> APIResult<Vec<SteamProfile>> {
    let query = "
        WITH ? as query
        SELECT ?fields
        FROM steam_profiles
        WHERE personaname IS NOT NULL
          AND not empty(personaname)
        ORDER BY greatest(
            jaroWinklerSimilarity(lower(personaname), lower(query)),
            jaroWinklerSimilarity(toString(account_id), lower(query)),
            jaroWinklerSimilarity(toString(toUInt64(account_id) + 76561197960265728), lower(query))
        ) DESC
        LIMIT 1 BY account_id
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
