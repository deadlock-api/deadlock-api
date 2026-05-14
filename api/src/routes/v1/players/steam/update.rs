use core::time::Duration;
use std::collections::{HashMap, HashSet};

use axum::http::StatusCode;
use clickhouse::Row;
use futures::StreamExt;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::{instrument, warn};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::parse::{parse_steam_id, steamid3_to_steamid64};

/// Maximum number of account IDs that can be refreshed in a single call.
/// Matches the `GetPlayerSummaries` upstream batch size so the whole request
/// is covered by one summary call.
pub(super) const MAX_REFRESH_ACCOUNT_IDS: usize = 100;

/// Concurrency cap for the per-account `GetFriendList` calls. Matches the
/// background `steam-profile-fetcher` tool to keep the shared API-key
/// budget predictable.
const FRIENDS_FETCH_CONCURRENCY: usize = 10;

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
pub(super) struct SteamProfileInsertRow {
    pub(super) account_id: u32,
    pub(super) personaname: String,
    pub(super) profileurl: String,
    pub(super) avatar: String,
    pub(super) avatarmedium: String,
    pub(super) avatarfull: String,
    pub(super) personastate: i8,
    pub(super) realname: Option<String>,
    pub(super) countrycode: Option<String>,
    #[serde(rename = "friends.account_id")]
    pub(super) friends_account_id: Vec<u32>,
    #[serde(rename = "friends.friend_since")]
    pub(super) friends_friend_since: Vec<u32>,
}

/// Apply tight rate limits, fetch the given accounts from the Steam Web API
/// (summaries + friend lists), and insert the result into `steam_profiles`.
/// Returns the freshly-fetched rows so the caller can serve them without
/// hitting the (possibly cached) read path.
///
/// Protected users are filtered out before any upstream call. Caller is
/// expected to have deduped + bounded the input.
pub(super) async fn refresh_steam_profiles(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    account_ids: Vec<u32>,
) -> APIResult<Vec<SteamProfileInsertRow>> {
    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            "steam_refresh",
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

    if account_ids.is_empty() {
        return Ok(Vec::new());
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

    let rows = build_insert_rows(summaries, &mut friends_by_account);
    if !rows.is_empty() {
        insert_profiles(&state.ch_client, &rows)
            .await
            .map_err(|e| {
                warn!("Failed to insert steam profiles: {e}");
                APIError::internal("Failed to persist Steam profiles.")
            })?;
    }
    Ok(rows)
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
) -> HashMap<u32, Vec<SteamFriend>> {
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

fn build_insert_rows(
    summaries: Vec<SteamPlayer>,
    friends_by_account: &mut HashMap<u32, Vec<SteamFriend>>,
) -> Vec<SteamProfileInsertRow> {
    let mut rows = Vec::with_capacity(summaries.len());
    let mut seen = HashSet::with_capacity(summaries.len());
    for player in summaries {
        if !seen.insert(player.steamid) {
            continue;
        }
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
    rows
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
