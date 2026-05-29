use std::collections::{HashMap, HashSet};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use chrono::Utc;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::steam::update::{
    MAX_REFRESH_ACCOUNT_IDS, SteamProfileInsertRow, refresh_steam_profiles,
};
use crate::services::clickhouse_batcher::{BatchQuery, ClickhouseBatcher, in_clause};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam_search_index::IndexedProfile;
use crate::utils::parse::{comma_separated_deserialize, steamid64_to_steamid3};
use crate::utils::types::AccountIdQuery;

#[derive(Deserialize, IntoParams, Clone)]
pub(crate) struct AccountIdsQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u64>,
    /// Refresh the listed profiles from the Steam Web API before returning.
    #[serde(default)]
    pub(crate) refresh: bool,
}

#[derive(Debug, Clone, Deserialize, IntoParams)]
pub(super) struct SteamSearchQuery {
    /// Search query for Steam profiles.
    search_query: String,
    /// Maximum number of profiles to return.
    #[param(inline, default = "100", maximum = 1000, minimum = 1)]
    limit: Option<u32>,
    /// Only return profiles that have played at least this many matches in the
    /// last 30 days. Defaults to 5 to filter out inactive/empty profiles and
    /// keep search responsive.
    #[param(inline, default = "5", minimum = 0)]
    min_matches_played_last_30d: Option<u32>,
    /// Only return profiles whose `last_team_avg_badge` is at least this
    /// value. Defaults to 0 (no filter). Profiles with no recorded badge are
    /// stored as 0 and are excluded when this is set above 0.
    #[param(inline, default = "0", minimum = 0)]
    min_last_team_avg_badge: Option<u32>,
    /// Weight applied to `log1p(matches_played_last_30d)` when reranking
    /// candidates. The final score per profile is
    /// `jaro_winkler(personaname_lc, query) + weight * log1p(matches_played)`.
    /// Set to 0 to rank purely by string similarity; raise it to bias toward
    /// active/popular players.
    #[param(inline, default = "0.02", minimum = 0.0)]
    matches_played_weight: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub(crate) struct SteamFriend {
    pub(crate) account_id: u32,
    pub(crate) friend_since: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct SteamProfile {
    pub(crate) account_id: u32,
    pub(crate) personaname: String,
    pub(super) profileurl: String,
    pub(super) avatar: String,
    pub(super) avatarmedium: String,
    pub(super) avatarfull: String,
    pub(super) realname: Option<String>,
    pub(super) countrycode: Option<String>,
    pub(super) last_updated: chrono::DateTime<Utc>,
    pub(super) friends: Vec<SteamFriend>,
    pub(super) matches_played_last_30d: u64,
    pub(super) last_team_avg_badge: Option<u32>,
}

#[derive(Debug, Clone, Row, Deserialize)]
pub(crate) struct SteamProfileRow {
    pub(crate) account_id: u32,
    pub(crate) personaname: String,
    pub(crate) profileurl: String,
    pub(crate) avatar: String,
    pub(crate) avatarmedium: String,
    pub(crate) avatarfull: String,
    pub(crate) realname: Option<String>,
    pub(crate) countrycode: Option<String>,
    #[serde(with = "clickhouse::serde::chrono::datetime")]
    pub(crate) last_updated: chrono::DateTime<Utc>,
    #[serde(rename = "friends.account_id", default)]
    pub(crate) friends_account_id: Vec<u32>,
    #[serde(rename = "friends.friend_since", default)]
    pub(crate) friends_friend_since: Vec<u32>,
    #[serde(default)]
    pub(crate) matches_played_last_30d: u64,
    #[serde(default)]
    pub(crate) last_team_avg_badge: Option<u32>,
}

impl From<SteamProfileRow> for SteamProfile {
    fn from(row: SteamProfileRow) -> Self {
        let friends = row
            .friends_account_id
            .into_iter()
            .zip(row.friends_friend_since)
            .filter_map(|(account_id, ts)| {
                chrono::DateTime::from_timestamp(ts.into(), 0).map(|friend_since| SteamFriend {
                    account_id,
                    friend_since,
                })
            })
            .collect();
        Self {
            account_id: row.account_id,
            personaname: row.personaname,
            profileurl: row.profileurl,
            avatar: row.avatar,
            avatarmedium: row.avatarmedium,
            avatarfull: row.avatarfull,
            realname: row.realname,
            countrycode: row.countrycode,
            last_updated: row.last_updated,
            friends,
            matches_played_last_30d: row.matches_played_last_30d,
            last_team_avg_badge: row.last_team_avg_badge,
        }
    }
}

impl From<IndexedProfile> for SteamProfile {
    fn from(row: IndexedProfile) -> Self {
        let friends = row
            .friends
            .into_iter()
            .filter_map(|(account_id, ts)| {
                chrono::DateTime::from_timestamp(ts.into(), 0).map(|friend_since| SteamFriend {
                    account_id,
                    friend_since,
                })
            })
            .collect();
        Self {
            account_id: row.account_id,
            personaname: row.personaname,
            profileurl: row.profileurl,
            avatar: row.avatar,
            avatarmedium: row.avatarmedium,
            avatarfull: row.avatarfull,
            realname: row.realname,
            countrycode: row.countrycode,
            last_updated: row.last_updated,
            friends,
            matches_played_last_30d: row.matches_played,
            last_team_avg_badge: row.last_team_avg_badge,
        }
    }
}

impl From<SteamProfileInsertRow> for SteamProfile {
    fn from(row: SteamProfileInsertRow) -> Self {
        let friends = row
            .friends_account_id
            .into_iter()
            .zip(row.friends_friend_since)
            .filter_map(|(account_id, ts)| {
                chrono::DateTime::from_timestamp(ts.into(), 0).map(|friend_since| SteamFriend {
                    account_id,
                    friend_since,
                })
            })
            .collect();
        Self {
            account_id: row.account_id,
            personaname: row.personaname,
            profileurl: row.profileurl,
            avatar: row.avatar,
            avatarmedium: row.avatarmedium,
            avatarfull: row.avatarfull,
            realname: row.realname,
            countrycode: row.countrycode,
            last_updated: Utc::now(),
            friends,
            matches_played_last_30d: 0,
            last_team_avg_badge: None,
        }
    }
}

pub(crate) struct SteamProfileQuery;

impl BatchQuery for SteamProfileQuery {
    type Key = u32;
    type Value = SteamProfileRow;

    fn build_query(keys: &[u32]) -> String {
        format!(
            "
            SELECT
                sp.account_id AS account_id,
                personaname,
                profileurl,
                avatar,
                avatarmedium,
                avatarfull,
                realname,
                countrycode,
                last_updated,
                friends.account_id,
                friends.friend_since,
                ifNull(mp.matches_played, toUInt64(0)) AS matches_played_last_30d,
                mp.last_team_avg_badge AS last_team_avg_badge
            FROM steam_profiles sp
            LEFT JOIN player_match_counts30d mp ON sp.account_id = mp.account_id
            WHERE sp.account_id IN ({})
            ORDER BY last_updated DESC
            LIMIT 1 BY sp.account_id
            SETTINGS log_comment = 'steam_profile'
             ",
            in_clause(keys)
        )
    }

    fn key_of(value: &SteamProfileRow) -> u32 {
        value.account_id
    }
}

pub(crate) type SteamProfileBatcher = ClickhouseBatcher<SteamProfileQuery>;

pub(crate) async fn steam_single(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }
    state
        .batchers
        .steam_profile
        .load(account_id)
        .await
        .map(SteamProfile::from)
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/steam",
    params(AccountIdsQuery),
    responses(
        (status = OK, description = "Steam Profiles", body = [SteamProfile]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = NOT_FOUND, description = "No Steam profile found."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded (only enforced when refresh=true)."),
        (status = BAD_GATEWAY, description = "Steam Web API call failed (only when refresh=true)."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch steam profiles.")
    ),
    tags = ["Steam"],
    summary = "Batch Steam Profile",
    description = "
This endpoint returns Steam profiles of players.

Pass `refresh=true` to force a live refresh of the listed accounts from the
Steam Web API (`GetPlayerSummaries` + `GetFriendList`) before returning. The
refreshed rows are persisted to the `steam_profiles` table and returned in the
response with `last_updated` set to the current time. Refresh requests are
rate limited and capped at 100 account ids per call to stay inside the
shared Steam Web API key budget.

See: https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_(v0002)

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s (read path), 3req/min + 15req/h (refresh) |
| Key | - (read path), 10req/min + 60req/h (refresh) |
| Global | - (read path), 30req/min + 200req/h (refresh) |
    "
)]
pub(super) async fn steam(
    rate_limit_key: RateLimitKey,
    Query(AccountIdsQuery {
        account_ids,
        refresh,
    }): Query<AccountIdsQuery>,
    State(state): State<AppState>,
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
    let max_ids = if refresh {
        MAX_REFRESH_ACCOUNT_IDS
    } else {
        1_000
    };
    if account_ids.len() > max_ids {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Too many account ids provided (max {max_ids}, got {})",
                account_ids.len()
            ),
        ));
    }
    let protected_users = state
        .steam_client
        .get_protected_users(&state.pg_client)
        .await?;
    let account_ids = account_ids
        .into_iter()
        .filter(|id| !protected_users.contains(id))
        .collect::<Vec<_>>();

    if !refresh {
        let profiles = state
            .batchers
            .steam_profile
            .load_many(&account_ids)
            .await?
            .into_iter()
            .map(SteamProfile::from)
            .collect::<Vec<_>>();
        return Ok((HeaderMap::new(), Json(profiles)));
    }

    let refreshed = refresh_steam_profiles(&state, &rate_limit_key, &account_ids).await?;
    let fetched_ids: HashSet<u32> = refreshed.iter().map(|r| r.account_id).collect();
    let mut profiles: Vec<SteamProfile> = refreshed.into_iter().map(SteamProfile::from).collect();

    let refreshed_ids: Vec<u32> = profiles.iter().map(|p| p.account_id).collect();
    if !refreshed_ids.is_empty() {
        let matches_map =
            fetch_matches_played_last_30d(&state.ch_client_ro, &refreshed_ids).await?;
        for profile in &mut profiles {
            if let Some(&(count, last_team_avg_badge)) = matches_map.get(&profile.account_id) {
                profile.matches_played_last_30d = count;
                profile.last_team_avg_badge = last_team_avg_badge;
            }
        }
    }

    let missing: Vec<u32> = account_ids
        .into_iter()
        .filter(|id| !fetched_ids.contains(id))
        .collect();
    if !missing.is_empty() {
        let fallback = state.batchers.steam_profile.load_many(&missing).await?;
        profiles.extend(fallback.into_iter().map(SteamProfile::from));
    }

    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok((headers, Json(profiles)))
}

#[derive(Debug, Clone, Row, Deserialize)]
struct MatchesPlayed30dRow {
    account_id: u32,
    matches_played: u64,
    last_team_avg_badge: Option<u32>,
}

async fn fetch_matches_played_last_30d(
    ch_client: &clickhouse::Client,
    account_ids: &[u32],
) -> APIResult<HashMap<u32, (u64, Option<u32>)>> {
    let query = format!(
        "
        SELECT account_id, matches_played, last_team_avg_badge
        FROM player_match_counts30d
        WHERE account_id IN ({})
        SETTINGS log_comment = 'steam_matches_played_last_30d'
        ",
        in_clause(account_ids)
    );
    match ch_client
        .query(&query)
        .fetch_all::<MatchesPlayed30dRow>()
        .await
    {
        Ok(rows) => Ok(rows
            .into_iter()
            .map(|r| (r.account_id, (r.matches_played, r.last_team_avg_badge)))
            .collect()),
        Err(e) => {
            warn!("Failed to fetch matches_played_last_30d: {e}");
            Err(APIError::InternalError {
                message: "Failed to fetch matches_played_last_30d".to_string(),
            })
        }
    }
}

async fn search_steam(
    state: &AppState,
    search_query: &str,
    limit: u32,
    min_matches_played_last_30d: u32,
    min_last_team_avg_badge: u32,
    matches_played_weight: f64,
) -> APIResult<Vec<SteamProfile>> {
    let t0 = std::time::Instant::now();
    let hits = match state.steam_search_index.search(
        search_query,
        u64::from(min_matches_played_last_30d),
        min_last_team_avg_badge,
        limit as usize,
        matches_played_weight,
    ) {
        Ok(Some(hits)) => hits,
        Ok(None) => {
            return Err(APIError::status_msg(
                StatusCode::SERVICE_UNAVAILABLE,
                "Steam search index is still building, try again shortly.",
            ));
        }
        Err(e) => {
            warn!("Steam search index query failed: {e}");
            return Err(APIError::InternalError {
                message: "Failed to query steam search index".to_string(),
            });
        }
    };

    let tantivy_ms = t0.elapsed().as_millis();
    let mut profiles: Vec<SteamProfile> = hits.into_iter().map(SteamProfile::from).collect();

    if let Some(account_id) = search_query
        .trim()
        .parse::<u64>()
        .ok()
        .and_then(|id| steamid64_to_steamid3(id).ok())
        && profiles.first().map(|p| p.account_id) != Some(account_id)
    {
        profiles.retain(|p| p.account_id != account_id);
        if let Ok(row) = state.batchers.steam_profile.load(account_id).await {
            profiles.insert(0, SteamProfile::from(row));
        }
    }

    if profiles.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            "No Steam profiles found.",
        ));
    }

    profiles.truncate(limit as usize);
    debug!(
        target: "steam_search",
        tantivy_ms,
        hits = profiles.len(),
        "steam search timings"
    );
    Ok(profiles)
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
    tags = ["Steam"],
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
    Query(SteamSearchQuery {
        search_query,
        limit,
        min_matches_played_last_30d,
        min_last_team_avg_badge,
        matches_played_weight,
    }): Query<SteamSearchQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let limit = limit.unwrap_or(100).clamp(1, 1000);
    let min_matches_played_last_30d = min_matches_played_last_30d.unwrap_or(5);
    let min_last_team_avg_badge = min_last_team_avg_badge.unwrap_or(0);
    let matches_played_weight = matches_played_weight.unwrap_or(0.02).max(0.0);
    search_steam(
        &state,
        &search_query,
        limit,
        min_matches_played_last_30d,
        min_last_team_avg_badge,
        matches_played_weight,
    )
    .await
    .map(Json)
}
