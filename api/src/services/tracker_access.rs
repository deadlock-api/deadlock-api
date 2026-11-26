//! Which accounts' player trackers are open to everyone because of the ingest clients.
//!
//! An account's tracker opens when an ingest client that sends the player's account id uploaded a
//! verified salt for it recently, or when a Steam friend of the account did. The uploaders and
//! their friends come from scans of `match_salts` and `steam_profiles`, so they are rebuilt in
//! the background for all accounts at once instead of per request.

use core::time::Duration;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use arc_swap::ArcSwapOption;
use tracing::{info, warn};

/// How recent an upload must be for the account to count as running an ingest client.
pub(crate) const INGEST_ACTIVE_WINDOW_DAYS: u32 = 14;

/// How often the uploaders and their friends are rebuilt.
const REFRESH_INTERVAL: Duration = Duration::from_mins(10);

/// `match_salts.username` prefixes of the ingest clients that send the uploading player's account
/// id last, as `<prefix><account_id>` or, for the `DeadChaps` companion,
/// `<prefix><version>:<account_id>`. Clients that name only themselves (Mod Manager, Statlocker)
/// cannot be credited to an account, and `botlocker:<id>` names the bot that fetched the salt,
/// not a player.
const INGEST_USERNAME_PREFIXES: &[&str] =
    &["ingest-tool:", "deadlockplus:", "deadchaps-companion/"];

/// The accounts an ingest client uploaded verified salts for, and their Steam friends.
#[derive(Debug, Default)]
pub(crate) struct Snapshot {
    /// Unix timestamp of each uploader's newest verified upload within the window.
    last_upload_at: HashMap<u32, u32>,
    /// Accounts on an uploader's Steam friend list.
    uploader_friends: HashSet<u32>,
}

impl Snapshot {
    pub(crate) fn last_upload_at(&self, account_id: u32) -> Option<u32> {
        self.last_upload_at.get(&account_id).copied()
    }

    /// Whether `account_id` is on an uploader's friend list or lists an uploader as a friend.
    /// Steam friendships are mutual, but a private profile's list is not stored, so both sides
    /// are checked.
    pub(crate) fn is_uploader_friend(&self, account_id: u32, friends: &[u32]) -> bool {
        self.uploader_friends.contains(&account_id)
            || friends
                .iter()
                .any(|friend| self.last_upload_at.contains_key(friend))
    }
}

#[derive(Default)]
pub(crate) struct TrackerAccess {
    snapshot: ArcSwapOption<Snapshot>,
}

impl TrackerAccess {
    /// `None` until the first rebuild finished.
    pub(crate) fn snapshot(&self) -> Option<Arc<Snapshot>> {
        self.snapshot.load_full()
    }

    pub(crate) fn spawn_refresh_loop(self: Arc<Self>, ch_client: clickhouse::Client) {
        tokio::spawn(async move {
            loop {
                match build_snapshot(&ch_client).await {
                    Ok(snapshot) => {
                        info!(
                            uploaders = snapshot.last_upload_at.len(),
                            uploader_friends = snapshot.uploader_friends.len(),
                            "Tracker access rebuilt"
                        );
                        self.snapshot.store(Some(Arc::new(snapshot)));
                    }
                    // The previous snapshot stays in use.
                    Err(e) => warn!("Tracker access rebuild failed: {e}"),
                }
                tokio::time::sleep(REFRESH_INTERVAL).await;
            }
        });
    }
}

/// `POST /v1/matches/salts` takes any `username` unverified, so an upload only counts once the
/// downloader verified that very salt (match, cluster and metadata salt), not merely some salt of
/// its match: the endpoint drops salts that are already verified, so only the first sender of a
/// salt nobody had yet is credited, and a username cannot be put on someone else's salt. Verdicts
/// are separate rows without a `username`, hence the second lookup.
async fn build_snapshot(ch_client: &clickhouse::Client) -> clickhouse::error::Result<Snapshot> {
    let uploads: Vec<(u32, u32)> = ch_client
        .query(
            "
            WITH uploads AS (
                SELECT match_id, cluster_id, metadata_salt, created_at,
                    toUInt32OrZero(splitByChar(':', username)[-1]) AS account_id
                FROM match_salts
                WHERE created_at >= now() - toIntervalDay(?)
                  AND arrayExists(prefix -> startsWith(username, prefix), ?)
            )
            SELECT account_id, toUnixTimestamp(max(created_at))
            FROM uploads
            WHERE account_id > 0 AND (match_id, cluster_id, metadata_salt) IN (
                SELECT match_id, cluster_id, metadata_salt FROM match_salts
                WHERE verified_at IS NOT NULL AND match_id IN (SELECT match_id FROM uploads)
            )
            GROUP BY account_id
            SETTINGS log_comment = 'tracker_access_uploaders'
            ",
        )
        .bind(INGEST_ACTIVE_WINDOW_DAYS)
        .bind(INGEST_USERNAME_PREFIXES)
        .fetch_all()
        .await?;
    let last_upload_at: HashMap<u32, u32> = uploads.into_iter().collect();

    let uploader_ids: Vec<u32> = last_upload_at.keys().copied().collect();
    let uploader_friends: Vec<u32> = if uploader_ids.is_empty() {
        vec![]
    } else {
        ch_client
            .query(
                "
                SELECT DISTINCT arrayJoin(`friends.account_id`)
                FROM steam_profiles FINAL
                WHERE account_id IN ?
                SETTINGS log_comment = 'tracker_access_uploader_friends'
                ",
            )
            .bind(uploader_ids)
            .fetch_all()
            .await?
    };

    Ok(Snapshot {
        last_upload_at,
        uploader_friends: uploader_friends.into_iter().collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn friends_count_from_either_side() {
        let snapshot = Snapshot {
            last_upload_at: HashMap::from([(1, 100)]),
            uploader_friends: HashSet::from([2]),
        };
        // On the uploader's list.
        assert!(snapshot.is_uploader_friend(2, &[]));
        // Lists the uploader, whose own list is private.
        assert!(snapshot.is_uploader_friend(3, &[1]));
        assert!(!snapshot.is_uploader_friend(4, &[5]));
        assert_eq!(snapshot.last_upload_at(1), Some(100));
        assert_eq!(snapshot.last_upload_at(2), None);
    }
}
