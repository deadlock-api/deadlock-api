use core::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use clickhouse::Row;
use futures::StreamExt;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::{instrument, warn};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::parse::{parse_steam_id, steamid3_to_steamid64};

/// Maximum number of account IDs accepted in a single request. Matches the
/// `GetPlayerSummaries` upstream batch size so that a single call to Steam
/// covers the whole request.
const MAX_ACCOUNT_IDS_PER_REQUEST: usize = 100;

/// Concurrency cap for the per-account `GetFriendList` calls. Each id costs one
/// Steam Web API request, so we keep this conservative to avoid spiking the
/// shared API-key budget.
const FRIENDS_FETCH_CONCURRENCY: usize = 5;

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub(super) struct SteamUpdateRequest {
    /// List of account IDs (`SteamID3`) to refresh from the Steam Web API.
    /// Each id costs roughly two upstream calls (one shared summary call plus
    /// one friend-list call), so requests are capped at
    /// `MAX_ACCOUNT_IDS_PER_REQUEST`.
    #[schema(min_items = 1, max_items = 100)]
    pub(super) account_ids: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct SteamUpdateResponse {
    /// Number of profiles that were fetched from Steam and persisted.
    pub(super) updated: usize,
    /// Account IDs that Steam did not return a summary for. These are likely
    /// deleted, renamed (different `SteamID3`), or otherwise unavailable.
    pub(super) not_found: Vec<u32>,
    /// Account IDs that were excluded because they are in the protected list.
    pub(super) protected: Vec<u32>,
}

#[derive(Debug, Deserialize)]
struct SteamPlayerSummariesResponse {
    response: SteamPlayerSummariesInner,
}

#[derive(Debug, Deserialize)]
struct SteamPlayerSummariesInner {
    #[serde(default)]
    players: Vec<SteamPlayer>,
}

#[derive(Debug, Deserialize)]
struct SteamPlayer {
    #[serde(deserialize_with = "parse_steam_id")]
    steamid: u32,
    #[serde(default)]
    personaname: String,
    #[serde(default)]
    profileurl: String,
    #[serde(default)]
    avatar: String,
    #[serde(default)]
    avatarmedium: String,
    #[serde(default)]
    avatarfull: String,
    #[serde(default)]
    personastate: i8,
    realname: Option<String>,
    loccountrycode: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SteamFriendListResponse {
    friendslist: SteamFriendList,
}

#[derive(Debug, Deserialize)]
struct SteamFriendList {
    #[serde(default)]
    friends: Vec<SteamFriend>,
}

#[derive(Debug, Deserialize)]
struct SteamFriend {
    #[serde(deserialize_with = "parse_steam_id")]
    steamid: u32,
    friend_since: u32,
}

/// Row written to the `steam_profiles` table. The column list mirrors the
/// background steam-profile-fetcher tool so the two writers stay consistent.
/// `last_updated` is intentionally omitted; `ClickHouse` fills it via the
/// column default (`now()`).
#[derive(Debug, Serialize, Row)]
struct SteamProfileInsertRow {
    account_id: u32,
    personaname: String,
    profileurl: String,
    avatar: String,
    avatarmedium: String,
    avatarfull: String,
    personastate: i8,
    realname: Option<String>,
    countrycode: Option<String>,
    #[serde(rename = "friends.account_id")]
    friends_account_id: Vec<u32>,
    #[serde(rename = "friends.friend_since")]
    friends_friend_since: Vec<u32>,
}

#[utoipa::path(
    post,
    path = "/steam/update",
    request_body = SteamUpdateRequest,
    responses(
        (status = OK, description = "Steam profiles refreshed.", body = SteamUpdateResponse),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded."),
        (status = BAD_GATEWAY, description = "Steam Web API call failed."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to persist Steam profiles.")
    ),
    tags = ["Steam"],
    summary = "Refresh Steam Profiles",
    description = "
Triggers an immediate refresh of the given Steam profiles from the Steam Web API and
persists the result. New rows are inserted into the `steam_profiles` table; the
table is a `ReplacingMergeTree` and read queries already pick the latest row per
account, so the next read will see the fresh data without any explicit cache bust.

Protected users are silently skipped and reported back in the response.

Because each id translates into roughly two upstream Steam Web API calls (one
shared `GetPlayerSummaries` batch plus one `GetFriendList` call per account),
this endpoint is rate limited tightly to stay inside the shared API key budget.

See: https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_(v0002)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 3req/min, 15req/h |
| Key | 10req/min, 60req/h |
| Global | 30req/min, 200req/h |
    "
)]
pub(super) async fn steam_update(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    Json(SteamUpdateRequest { account_ids }): Json<SteamUpdateRequest>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "steam_update",
            &[
                Quota::ip_limit(3, Duration::from_mins(1)),
                Quota::ip_limit(15, Duration::from_hours(1)),
                Quota::key_limit(10, Duration::from_mins(1)),
                Quota::key_limit(60, Duration::from_hours(1)),
                Quota::global_limit(30, Duration::from_mins(1)),
                Quota::global_limit(200, Duration::from_hours(1)),
            ],
        )
        .await?;

    let account_ids: Vec<u32> = account_ids
        .into_iter()
        .filter(|&id| id != 0)
        .unique()
        .collect();
    if account_ids.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "No valid account ids provided.",
        ));
    }
    if account_ids.len() > MAX_ACCOUNT_IDS_PER_REQUEST {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Too many account ids provided (max {MAX_ACCOUNT_IDS_PER_REQUEST}, got {})",
                account_ids.len()
            ),
        ));
    }

    let protected_users = state
        .steam_client
        .get_protected_users(&state.pg_client)
        .await?;
    let (protected, account_ids): (Vec<u32>, Vec<u32>) = account_ids
        .into_iter()
        .partition(|id| protected_users.contains(id));

    if account_ids.is_empty() {
        return Ok(Json(SteamUpdateResponse {
            updated: 0,
            not_found: vec![],
            protected,
        }));
    }

    let api_key = state.steam_client.steam_api_key();
    let http = state.steam_client.http_client();

    let (summaries_result, mut friends_by_account) = tokio::join!(
        fetch_steam_summaries(http, api_key, &account_ids),
        fetch_friends_for_accounts(http, api_key, &account_ids),
    );

    let summaries = summaries_result.map_err(|e| {
        warn!("Steam GetPlayerSummaries call failed: {e}");
        APIError::status_msg(
            StatusCode::BAD_GATEWAY,
            "Failed to fetch profiles from Steam.",
        )
    })?;

    let mut rows = Vec::with_capacity(summaries.len());
    let mut fetched_ids = Vec::with_capacity(summaries.len());
    for player in summaries {
        fetched_ids.push(player.steamid);
        let friends = friends_by_account
            .remove(&player.steamid)
            .unwrap_or_default();
        let (friends_account_id, friends_friend_since): (Vec<u32>, Vec<u32>) = friends
            .into_iter()
            .map(|f| (f.steamid, f.friend_since))
            .unzip();
        rows.push(SteamProfileInsertRow {
            account_id: player.steamid,
            personaname: player.personaname,
            profileurl: player.profileurl,
            avatar: player.avatar,
            avatarmedium: player.avatarmedium,
            avatarfull: player.avatarfull,
            personastate: player.personastate,
            realname: player.realname,
            countrycode: player.loccountrycode,
            friends_account_id,
            friends_friend_since,
        });
    }

    let updated = if rows.is_empty() {
        0
    } else {
        insert_profiles(&state.ch_client, &rows)
            .await
            .map_err(|e| {
                warn!("Failed to insert steam profiles: {e}");
                APIError::internal("Failed to persist Steam profiles.")
            })?;
        rows.len()
    };

    let not_found: Vec<u32> = account_ids
        .into_iter()
        .filter(|id| !fetched_ids.contains(id))
        .collect();

    Ok(Json(SteamUpdateResponse {
        updated,
        not_found,
        protected,
    }))
}

#[instrument(skip_all, fields(accounts = account_ids.len()))]
async fn fetch_steam_summaries(
    http_client: &reqwest::Client,
    api_key: &str,
    account_ids: &[u32],
) -> reqwest::Result<Vec<SteamPlayer>> {
    if account_ids.is_empty() {
        return Ok(Vec::new());
    }
    let steamids = account_ids
        .iter()
        .map(|&id| steamid3_to_steamid64(id).to_string())
        .join(",");
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key={api_key}&steamids={steamids}"
    );
    let response: SteamPlayerSummariesResponse = http_client
        .get(&url)
        .timeout(Duration::from_secs(10))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(response.response.players)
}

#[instrument(skip_all, fields(accounts = account_ids.len()))]
async fn fetch_friends_for_accounts(
    http_client: &reqwest::Client,
    api_key: &str,
    account_ids: &[u32],
) -> std::collections::HashMap<u32, Vec<SteamFriend>> {
    let results: Vec<_> = futures::stream::iter(account_ids.iter().copied())
        .map(|account_id| async move {
            (
                account_id,
                fetch_friends_for_account(http_client, api_key, account_id).await,
            )
        })
        .buffer_unordered(FRIENDS_FETCH_CONCURRENCY)
        .collect()
        .await;

    results
        .into_iter()
        .filter_map(|(account_id, result)| match result {
            Ok(friends) => Some((account_id, friends)),
            Err(e) => {
                warn!("Failed to fetch friends for {account_id}: {e}");
                None
            }
        })
        .collect()
}

/// Returns an empty list for private profiles (Steam responds 401/403).
async fn fetch_friends_for_account(
    http_client: &reqwest::Client,
    api_key: &str,
    account_id: u32,
) -> reqwest::Result<Vec<SteamFriend>> {
    let steam_id64 = steamid3_to_steamid64(account_id);
    let url = format!(
        "https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key={api_key}&steamid={steam_id64}&relationship=friend"
    );
    let response = http_client
        .get(&url)
        .timeout(Duration::from_secs(10))
        .send()
        .await?;
    if matches!(
        response.status(),
        reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
    ) {
        return Ok(Vec::new());
    }
    let body: SteamFriendListResponse = response.error_for_status()?.json().await?;
    Ok(body.friendslist.friends)
}

#[instrument(skip_all, fields(rows = rows.len()))]
async fn insert_profiles(
    ch_client: &clickhouse::Client,
    rows: &[SteamProfileInsertRow],
) -> clickhouse::error::Result<()> {
    let mut inserter = ch_client
        .insert::<SteamProfileInsertRow>("steam_profiles")
        .await?;
    for row in rows {
        inserter.write(row).await?;
    }
    inserter.end().await
}
