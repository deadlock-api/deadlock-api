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

/// Matches the `GetPlayerSummaries` upstream batch size so a single summary
/// call covers the whole request.
pub(super) const MAX_REFRESH_ACCOUNT_IDS: usize = 100;

/// Matches the background `steam-profile-fetcher` tool.
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

/// `last_updated` is omitted so `ClickHouse` fills it via the column default.
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

pub(super) async fn refresh_steam_profiles(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    account_ids: &[u32],
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
        fetch_steam_summaries(http, api_key, account_ids),
        fetch_friends_for_accounts(http, api_key, account_ids),
    );

    let summaries = summaries_result.map_err(|e| {
        warn!("Steam GetPlayerSummaries call failed: {e}");
        APIError::status_msg(
            StatusCode::BAD_GATEWAY,
            "Failed to fetch profiles from Steam.",
        )
    })?;

    let (mut rows, missing_friends) = build_insert_rows(summaries, &mut friends_by_account);
    if !missing_friends.is_empty() {
        keep_stored_friends(&state.ch_client_ro, &mut rows, &missing_friends).await;
    }
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
    futures::stream::iter(account_ids.iter().copied())
        .map(|account_id| async move {
            (
                account_id,
                fetch_friends_for_account(http_client, api_key, account_id).await,
            )
        })
        .buffer_unordered(FRIENDS_FETCH_CONCURRENCY)
        .filter_map(|(account_id, result)| async move {
            match result {
                Ok(friends) => Some((account_id, friends)),
                Err(e) => {
                    warn!("Failed to fetch friends for {account_id}: {e}");
                    None
                }
            }
        })
        .collect()
        .await
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

/// Also returns the accounts whose friends list could not be fetched; their rows carry an empty
/// list for now.
fn build_insert_rows(
    summaries: Vec<SteamPlayer>,
    friends_by_account: &mut HashMap<u32, Vec<SteamFriend>>,
) -> (Vec<SteamProfileInsertRow>, HashSet<u32>) {
    let mut rows = Vec::with_capacity(summaries.len());
    let mut seen = HashSet::with_capacity(summaries.len());
    let mut missing_friends = HashSet::new();
    for player in summaries {
        if !seen.insert(player.steamid) {
            continue;
        }
        let friends = if let Some(friends) = friends_by_account.remove(&player.steamid) {
            friends
        } else {
            missing_friends.insert(player.steamid);
            Vec::new()
        };
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
    (rows, missing_friends)
}

/// `steam_profiles` is a `ReplacingMergeTree` without a version column, so a new row replaces the
/// stored one whole. For accounts whose friends fetch failed, carry the stored friends list over
/// instead of overwriting it with an empty one; if even that lookup fails, skip saving those
/// profiles this time.
#[instrument(skip_all, fields(accounts = missing.len()))]
async fn keep_stored_friends(
    ch_client: &clickhouse::Client,
    rows: &mut Vec<SteamProfileInsertRow>,
    missing: &HashSet<u32>,
) {
    let account_ids = missing.iter().copied().collect_vec();
    match stored_friends(ch_client, &account_ids).await {
        Ok(stored) => {
            let mut stored: HashMap<u32, StoredFriends> =
                stored.into_iter().map(|f| (f.account_id, f)).collect();
            for row in rows.iter_mut() {
                if let Some(f) = stored.remove(&row.account_id) {
                    row.friends_account_id = f.friends_account_id;
                    row.friends_friend_since = f.friends_friend_since;
                }
            }
        }
        Err(e) => {
            warn!(
                "Failed to look up stored friends, not saving {} profiles: {e}",
                missing.len()
            );
            rows.retain(|r| !missing.contains(&r.account_id));
        }
    }
}

#[derive(Row, Deserialize)]
struct StoredFriends {
    account_id: u32,
    #[serde(rename = "friends.account_id")]
    friends_account_id: Vec<u32>,
    #[serde(rename = "friends.friend_since")]
    friends_friend_since: Vec<u32>,
}

async fn stored_friends(
    ch_client: &clickhouse::Client,
    account_ids: &[u32],
) -> clickhouse::error::Result<Vec<StoredFriends>> {
    ch_client
        .query(
            // One argMax over both arrays, so they always come from the same row: two
            // separate ones can pick different rows on a last_updated tie, and Nested
            // arrays of different lengths make the whole insert fail.
            "SELECT account_id, \
                 tupleElement(latest_friends, 1) AS `friends.account_id`, \
                 tupleElement(latest_friends, 2) AS `friends.friend_since` \
             FROM ( \
                 SELECT account_id, \
                     argMax((friends.account_id, friends.friend_since), last_updated) AS latest_friends \
                 FROM steam_profiles WHERE account_id IN ? GROUP BY account_id \
             ) \
             SETTINGS log_comment = 'steam_refresh_stored_friends'",
        )
        .bind(account_ids)
        .fetch_all()
        .await
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

#[cfg(test)]
mod tests {
    use super::*;

    fn player(steamid: u32) -> SteamPlayer {
        SteamPlayer {
            steamid,
            personaname: String::new(),
            profileurl: String::new(),
            avatar: String::new(),
            avatarmedium: String::new(),
            avatarfull: String::new(),
            personastate: 0,
            realname: None,
            loccountrycode: None,
        }
    }

    #[test]
    fn test_failed_friends_fetch_is_reported_not_stored_as_empty() {
        // Account 2's GetFriendList failed, so it is missing from the map. An empty list in the
        // row would replace its stored friends.
        let mut friends = HashMap::from([(
            1,
            vec![SteamFriend {
                steamid: 3,
                friend_since: 100,
            }],
        )]);
        let (rows, missing) = build_insert_rows(vec![player(1), player(2)], &mut friends);
        assert_eq!(rows[0].friends_account_id, vec![3]);
        assert_eq!(missing, HashSet::from([2]));
    }
}
