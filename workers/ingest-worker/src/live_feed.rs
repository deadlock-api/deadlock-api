//! The matches the worker has just written, for the website's live page.
//!
//! Each flushed match leaves a small summary here. Every [`PUBLISH_EVERY`] the summaries since
//! the last publish become one entry of the Redis stream [`STREAM_KEY`]: how many matches were
//! written (`n`) and a random sample of at most [`MAX_SAMPLE`] of them (`m`, JSON). Live ingest
//! flushes about once a minute, so that is about one entry and one small `ClickHouse` lookup (the
//! sample's server regions) a minute. The API polls the stream only while someone watches.
//!
//! Nothing identifying goes out: no account ids, only the match id, its mode, rank, duration,
//! result, region and heroes.

use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};

use clickhouse::Row;
use clickhouse_utils::in_clause;
use rand::RngExt as _;
use redis::aio::ConnectionManager;
use serde::{Deserialize, Serialize};
use tracing::warn;
use valveprotos::deadlock::c_msg_match_meta_data_contents::{EMatchOutcome, MatchInfo};

/// The Redis stream the API reads; keep in sync with `api/src/services/live_requests.rs`.
pub(crate) const STREAM_KEY: &str = "live:ingested-matches";

/// Entries the stream keeps (`MAXLEN ~`); about an hour and a half of minute flushes.
const STREAM_MAX_LEN: usize = 100;

/// Most matches an entry carries. A minute's flush is 300 to 1,300 matches, more than a list can
/// show; `n` still counts all of them.
const MAX_SAMPLE: usize = 300;

/// How often the summaries since the last publish go out. The matches of one flush finish
/// within milliseconds of each other, so they land in one entry.
const PUBLISH_EVERY: Duration = Duration::from_secs(2);

/// One written match as the live page shows it, a positional array on the wire:
/// `[match_id, start_time, duration_s, game_mode, match_mode, average_badge, winning_team,
/// region, team0_hero_ids, team1_hero_ids]`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct IngestedMatch(
    u64,
    u32,
    u32,
    i32,
    i32,
    Option<u32>,
    Option<i32>,
    Option<String>,
    Vec<u32>,
    Vec<u32>,
);

impl IngestedMatch {
    pub(crate) fn new(match_info: &MatchInfo, average_badge: Option<u32>) -> Self {
        let mut players: Vec<_> = match_info
            .players
            .iter()
            .filter_map(|p| Some((p.team?, p.player_slot.unwrap_or_default(), p.hero_id?)))
            .filter(|&(_, _, hero)| hero > 0)
            .collect();
        players.sort_unstable();
        let team = |t: i32| {
            players
                .iter()
                .filter(|(team, ..)| *team == t)
                .map(|&(.., hero)| hero)
                .collect()
        };
        let winner = (match_info.match_outcome() == EMatchOutcome::KEOutcomeTeamWin)
            .then_some(match_info.winning_team)
            .flatten();
        Self(
            match_info.match_id.unwrap_or_default(),
            match_info.start_time.unwrap_or_default(),
            match_info.duration_s.unwrap_or_default(),
            match_info.game_mode.unwrap_or_default(),
            match_info.match_mode.unwrap_or_default(),
            average_badge.filter(|b| *b > 0),
            winner,
            None,
            team(0),
            team(1),
        )
    }

    const fn match_id(&self) -> u64 {
        self.0
    }
}

#[derive(Default)]
struct Pending {
    /// Matches written since the last publish, sampled or not.
    seen: u64,
    sample: Vec<IngestedMatch>,
}

/// Collects the written matches and publishes them; see the module docs.
pub(crate) struct LiveFeed {
    pending: Mutex<Pending>,
}

impl LiveFeed {
    /// Starts the publisher, or returns `None` (and the worker ingests without a feed) when
    /// Redis is unreachable at startup.
    pub(crate) async fn spawn(ch_client: clickhouse::Client) -> Option<Arc<Self>> {
        let redis = match db_clients::get_redis_client().await {
            Ok(redis) => redis,
            Err(e) => {
                warn!("Live feed off, Redis is unreachable: {e}");
                return None;
            }
        };
        let feed = Arc::new(Self {
            pending: Mutex::default(),
        });
        let publisher = Arc::clone(&feed);
        tokio::spawn(async move { publisher.run(redis, ch_client).await });
        Some(feed)
    }

    /// Adds a match whose rows were flushed.
    pub(crate) fn record(&self, ingested: IngestedMatch) {
        let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
        pending.seen = pending.seen.saturating_add(1);
        if pending.sample.len() < MAX_SAMPLE {
            pending.sample.push(ingested);
            return;
        }
        // Algorithm R: every match of the interval is equally likely to be in the sample.
        let slot = rand::rng().random_range(0..pending.seen);
        if let Some(entry) = usize::try_from(slot)
            .ok()
            .and_then(|i| pending.sample.get_mut(i))
        {
            *entry = ingested;
        }
    }

    async fn run(&self, mut redis: ConnectionManager, ch_client: clickhouse::Client) {
        let shutdown = service_utils::shutdown_token();
        let mut interval = tokio::time::interval(PUBLISH_EVERY);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                () = shutdown.cancelled() => break,
                _ = interval.tick() => {}
            }
            let Pending { seen, mut sample } =
                core::mem::take(&mut *self.pending.lock().unwrap_or_else(PoisonError::into_inner));
            if seen == 0 {
                continue;
            }
            match regions(&ch_client, &sample).await {
                Ok(regions) => {
                    for m in &mut sample {
                        m.7 = regions.get(&m.match_id()).cloned();
                    }
                }
                Err(e) => warn!("Live feed: looking up match regions failed: {e}"),
            }
            if let Err(e) = publish(&mut redis, seen, &sample).await {
                warn!("Live feed: publishing {seen} matches failed: {e}");
            }
        }
    }
}

#[derive(Debug, Row, Deserialize)]
struct RegionRow {
    match_id: u64,
    region: String,
}

/// The server region of each match: its cluster from the salts, the cluster's region from the
/// demo headers. One point lookup of a few hundred ids (~160 ms CPU), once per publish.
async fn regions(
    ch_client: &clickhouse::Client,
    sample: &[IngestedMatch],
) -> clickhouse::error::Result<HashMap<u64, String>> {
    if sample.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = in_clause(
        &sample
            .iter()
            .map(IngestedMatch::match_id)
            .collect::<Vec<_>>(),
    );
    let query = format!(
        "
        SELECT match_id,
            dictGet('default.server_clusters_dict', 'region', toUInt64(any(cluster_id))) AS region
        FROM match_salts
        WHERE match_id IN ({ids}) AND cluster_id > 0
        GROUP BY match_id
        SETTINGS log_comment = 'ingest_live_feed_regions', max_execution_time = 10
        "
    );
    let rows: Vec<RegionRow> = ch_client.query(&query).fetch_all().await?;
    Ok(rows
        .into_iter()
        .filter(|r| !r.region.is_empty())
        .map(|r| (r.match_id, r.region))
        .collect())
}

async fn publish(
    redis: &mut ConnectionManager,
    seen: u64,
    sample: &[IngestedMatch],
) -> Result<(), PublishError> {
    let matches = serde_json::to_string(sample)?;
    redis::cmd("XADD")
        .arg(STREAM_KEY)
        .arg("MAXLEN")
        .arg("~")
        .arg(STREAM_MAX_LEN)
        .arg("*")
        .arg("n")
        .arg(seen)
        .arg("m")
        .arg(matches)
        .query_async::<String>(redis)
        .await?;
    Ok(())
}

#[derive(Debug, thiserror::Error)]
enum PublishError {
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Redis(#[from] redis::RedisError),
}

#[cfg(test)]
mod tests {
    use valveprotos::deadlock::c_msg_match_meta_data_contents::Players;

    use super::*;

    fn player(team: i32, slot: u32, hero: u32) -> Players {
        Players {
            team: Some(team),
            player_slot: Some(slot),
            hero_id: Some(hero),
            ..Players::default()
        }
    }

    #[test]
    fn summary_splits_heroes_by_team_in_slot_order() {
        let info = MatchInfo {
            match_id: Some(42),
            start_time: Some(1_700_000_000),
            duration_s: Some(1800),
            game_mode: Some(1),
            match_mode: Some(4),
            winning_team: Some(1),
            players: vec![
                player(1, 3, 7),
                player(0, 2, 5),
                player(0, 1, 9),
                player(1, 4, 0),
            ],
            ..MatchInfo::default()
        };
        let m = IngestedMatch::new(&info, Some(81));
        assert_eq!(
            serde_json::to_string(&m).unwrap(),
            "[42,1700000000,1800,1,4,81,1,null,[9,5],[7]]"
        );
    }

    #[test]
    fn draw_has_no_winner() {
        let info = MatchInfo {
            match_outcome: Some(EMatchOutcome::KEOutcomeMatchDraw as i32),
            winning_team: Some(0),
            ..MatchInfo::default()
        };
        assert_eq!(IngestedMatch::new(&info, Some(0)).6, None);
        assert_eq!(IngestedMatch::new(&info, Some(0)).5, None);
    }

    #[test]
    fn sample_is_capped_and_counts_everything() {
        let feed = LiveFeed {
            pending: Mutex::default(),
        };
        for _ in 0..1000 {
            feed.record(IngestedMatch::new(&MatchInfo::default(), None));
        }
        let pending = feed.pending.lock().unwrap();
        assert_eq!(pending.seen, 1000);
        assert_eq!(pending.sample.len(), MAX_SAMPLE);
    }
}
