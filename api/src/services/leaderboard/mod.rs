//! Leaderboards from the Game Coordinator, shared by the leaderboard routes and the chat
//! commands, and their snapshots into `ClickHouse`.

pub(crate) mod types;

use core::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use base64::prelude::BASE64_STANDARD;
use cached::macros::cached;
use clickhouse::{RowOwned, RowWrite};
use clickhouse_utils::insert_rows;
use prost::Message as _;
use steam_proxy::{SteamProxyError, SteamProxyOptions, SteamProxyResponse};
use tracing::warn;
use valveprotos::deadlock::{
    CMsgClientToGcGetLeaderboard, CMsgClientToGcGetLeaderboardResponse, EgcCitadelClientMessages,
    c_msg_client_to_gc_get_leaderboard_response,
};

use crate::context::AppState;
use crate::services::leaderboard::types::{
    HeroLeaderboardClickhouse, LeaderboardClickhouse, LeaderboardRegion,
};

/// Fetches a leaderboard from Steam, at most every ten minutes per variant; concurrent misses on
/// the same variant wait for one Steam call instead of each making their own. Each fetch of the
/// current leaderboard is also snapshotted: here, not in the callers, so cache hits do not store
/// the same entries again.
#[cached(
    ttl_secs = 600,
    convert = "{ (region, hero_id, leaderboard_id) }",
    key = "(LeaderboardRegion, Option<u32>, Option<u32>)",
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_leaderboard_raw(
    state: &AppState,
    region: LeaderboardRegion,
    hero_id: Option<u32>,
    leaderboard_id: Option<u32>,
) -> Result<SteamProxyResponse, SteamProxyError> {
    let msg = CMsgClientToGcGetLeaderboard {
        leaderboard_region: Some(region as i32),
        hero_id,
        leaderboard_id,
    };
    let response = state
        .steam_client
        .call_steam_proxy_raw(
            EgcCitadelClientMessages::KEMsgClientToGcGetLeaderboard,
            &msg,
            SteamProxyOptions {
                in_all_groups: None,
                in_any_groups: None,
                cooldown: Duration::from_mins(1),
                soft_cooldown: None,
                request_timeout: Duration::from_secs(2),
                username: None,
            },
        )
        .await?;
    // Snapshots track the current leaderboard only; other leaderboards would mix seasons. A
    // response that does not decode is skipped here; the caller reports it.
    if leaderboard_id.is_none()
        && let Ok(data) = BASE64_STANDARD.decode(&response.data)
        && let Ok(proto) = CMsgClientToGcGetLeaderboardResponse::decode(data.as_slice())
    {
        spawn_snapshot(state.ch_client.clone(), region, hero_id, proto.entries);
    }
    Ok(response)
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
        #[expect(
            clippy::cast_possible_truncation,
            reason = "unix seconds fit in u32 until 2106"
        )]
        let Ok(now) = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as u32)
        else {
            warn!("Failed to get current time");
            return;
        };

        // Positions count every entry, also those without a rank, which are not stored.
        #[expect(
            clippy::cast_possible_truncation,
            reason = "leaderboards hold far fewer than u32::MAX entries"
        )]
        let ranked = entries
            .iter()
            .enumerate()
            .filter_map(|(i, entry)| Some(((i as u32).saturating_add(1), entry.rank?, entry)));
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
                insert_snapshot(&ch_client, "leaderboard", rows).await;
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
                insert_snapshot(&ch_client, "hero_leaderboard", rows).await;
            }
        }
    });
}

/// Writes the snapshot rows; failures are only logged.
async fn insert_snapshot<R: RowOwned + RowWrite + Sync>(
    ch_client: &clickhouse::Client,
    table: &str,
    rows: impl Iterator<Item = R>,
) {
    let rows: Vec<R> = rows.collect();
    if let Err(e) = insert_rows(ch_client, table, &rows).await {
        warn!("Failed to insert {table} to CH: {e}");
    }
}
