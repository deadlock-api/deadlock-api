//! The API's writes to `pending_matches`, the queue of matches to fetch: matches it was asked
//! for but could not fetch, live matches, and matches Steam says do not exist.

use std::collections::HashMap;

use cached::macros::cached;
use clickhouse::Row;
use clickhouse_utils::{BatchInserter, BatchQuery, ClickhouseBatcher};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

use crate::context::AppState;
use crate::utils::sql::id_list;

/// Matches below this id are not tracked.
pub(crate) const MIN_MATCH_ID: u64 = 31_247_321;
/// Matches from `active_matches` are pending while still being played; their salts only exist
/// once the match ended.
pub(crate) const MIN_AGE_SECS: u32 = 2 * 60 * 60;

/// A `pending_matches` row written by the API rather than by a materialized view.
///
/// A requested row is for a match the API was asked for but could not fetch, either because
/// the Steam proxy had no bot to spare or because bulk metadata was asked for a match it does
/// not have. Nothing is known about the match but a rough start time, estimated from its id,
/// which sorts it into its day and keeps it out of the pool while it may still be played.
/// The other columns are zeroed: `match_mode` is `Invalid`, which the to-fetch order reads as
/// "requested". `updated_at` is zero so this row never wins over one that knows more: a
/// `pending` row from `player_match_history` (versioned by `start_time`) or a `done` row from
/// salts or metadata.
///
/// An invalid row is `done` for a match Steam says does not exist, or a requested match the
/// to-fetch workers gave up on, so it leaves the to-fetch pool instead of staying pending
/// forever.
#[derive(Debug, Clone, Row, Serialize)]
pub(crate) struct PendingMatchRow {
    match_id: u64,
    state: i8,
    updated_at: u32,
    start_time: u32,
    match_mode: i8,
    game_mode: i8,
    badge: u32,
}

impl PendingMatchRow {
    const fn requested(match_id: u64, start_time: u32) -> Self {
        Self {
            match_id,
            state: 0,
            updated_at: 0,
            start_time,
            match_mode: 0,
            game_mode: 0,
            badge: 0,
        }
    }

    fn invalid(match_id: u64) -> Self {
        Self {
            state: 1,
            updated_at: u32::try_from(chrono::Utc::now().timestamp()).unwrap_or(u32::MAX),
            ..Self::requested(match_id, 0)
        }
    }
}

pub(crate) type PendingMatchInsertBatcher = BatchInserter<PendingMatchRow>;

/// The newest match id seen in `active_matches`. Ids above it can't be real matches yet.
#[cached(ttl_secs = 60, convert = "{ 0 }", key = "u8", sync_writes = "default")]
async fn newest_match_id(ch_client: &clickhouse::Client) -> clickhouse::error::Result<u64> {
    ch_client
        .query("SELECT max(match_id) FROM active_matches SETTINGS log_comment = 'newest_match_id'")
        .fetch_one()
        .await
}

/// Whether `match_id` is one `pending_matches` tracks: not too old and not newer than
/// any match seen being played.
async fn is_trackable(state: &AppState, match_id: u64) -> bool {
    if match_id < MIN_MATCH_ID {
        return false;
    }
    match newest_match_id(&state.ch_client_ro).await {
        Ok(newest) => match_id <= newest,
        Err(e) => {
            warn!("Failed to load the newest match id: {e}");
            false
        }
    }
}

/// How far below a requested id the start time estimate looks for a match with metadata.
/// Every 1000 ids since `MIN_MATCH_ID` hold one, except the newest, not fetched yet.
const START_TIME_ID_WINDOW: u64 = 1000;

#[derive(Debug, Clone, Row, Deserialize)]
pub(crate) struct EstimatedStartTimeRow {
    requested_id: u64,
    estimated_start: u32,
}

/// Rough start times of requested matches: that of the closest lower match with metadata, as
/// match ids grow with start time. Ids without one in reach are the newest matches, missing
/// from the result.
pub(crate) struct EstimatedStartTimeQuery;

impl BatchQuery for EstimatedStartTimeQuery {
    type Key = u64;
    type Value = EstimatedStartTimeRow;

    /// The id windows are read through an `IN` set rather than an `OR` of one range per id:
    /// key analysis of such an `OR` walks every mark of every part, ~10 ms per id, while the
    /// set is looked up by binary search. A batch of 200 ids costs ~1 CPU-second, a fifth of
    /// what single-id queries cost per id.
    fn build_query(keys: &[u64]) -> String {
        let ids = id_list(keys);
        format!(
            "SELECT toUInt64(requested) AS requested_id, \
                    toUnixTimestamp(argMax(st, match_id)) AS estimated_start \
             FROM ( \
                 SELECT match_id, any(start_time) AS st FROM match_player \
                 WHERE match_id IN ( \
                     SELECT arrayJoin(range(toUInt64(r - {START_TIME_ID_WINDOW}), \
                                            toUInt64(r + 1))) \
                     FROM (SELECT arrayJoin(CAST([{ids}], 'Array(UInt64)')) AS r)) \
                 GROUP BY match_id) \
             ARRAY JOIN arrayFilter(r -> match_id BETWEEN r - {START_TIME_ID_WINDOW} AND r, \
                                    [{ids}]) AS requested \
             GROUP BY requested \
             SETTINGS log_comment = 'requested_matches_start_times'"
        )
    }

    fn key_of(value: &EstimatedStartTimeRow) -> u64 {
        value.requested_id
    }

    /// Requests are queued off the request path, so waiting costs nothing and every id a
    /// batch adds is ~5x cheaper than a query of its own.
    fn linger_ms() -> u64 {
        5_000
    }

    fn max_batch_size() -> usize {
        200
    }
}

pub(crate) type EstimatedStartTimeBatcher = ClickhouseBatcher<EstimatedStartTimeQuery>;

/// Queues matches the API was asked for but could not fetch. Ids `pending_matches` doesn't
/// track are dropped, so a made-up id never enters the to-fetch pool.
pub(crate) async fn queue_requested_matches(state: &AppState, match_ids: &[u64]) {
    let mut trackable = Vec::with_capacity(match_ids.len());
    for &match_id in match_ids {
        if is_trackable(state, match_id).await {
            trackable.push(match_id);
        }
    }
    if trackable.is_empty() {
        return;
    }
    let start_times: HashMap<u64, u32> = match state
        .batchers
        .estimated_start_time
        .load_many(&trackable)
        .await
    {
        Ok(rows) => rows
            .into_iter()
            .map(|r| (r.requested_id, r.estimated_start))
            .collect(),
        Err(e) => {
            warn!("Failed to estimate start times of requested matches: {e}");
            HashMap::new()
        }
    };
    let now = u32::try_from(chrono::Utc::now().timestamp()).unwrap_or(u32::MAX);
    let rows = trackable
        .into_iter()
        .map(|match_id| {
            PendingMatchRow::requested(match_id, start_times.get(&match_id).copied().unwrap_or(now))
        })
        .collect();
    state.batchers.pending_match_insert.try_insert(rows);
}

/// [`queue_requested_matches`] for one match, off the request path.
pub(crate) fn queue_requested_match(state: &AppState, match_id: u64) {
    let state = state.clone();
    tokio::spawn(async move { queue_requested_matches(&state, &[match_id]).await });
}

/// Queues a match whose live URL was just requested, so it is fetched once it ended. Its start
/// time is the time of the request, which keeps it out of the pool for [`MIN_AGE_SECS`] while
/// it is still being played.
pub(crate) async fn queue_live_match(state: &AppState, match_id: u64) {
    let now = u32::try_from(chrono::Utc::now().timestamp()).unwrap_or(u32::MAX);
    let row = PendingMatchRow::requested(match_id, now);
    state.batchers.pending_match_insert.try_insert(vec![row]);
}

/// Marks a match Steam says does not exist as done, taking it out of the to-fetch pool.
pub(crate) async fn resolve_invalid_match(state: &AppState, match_id: u64) {
    if (MIN_MATCH_ID..u64::from(u32::MAX)).contains(&match_id) {
        let row = PendingMatchRow::invalid(match_id);
        state.batchers.pending_match_insert.try_insert(vec![row]);
    }
}

/// Marks requested matches the to-fetch workers kept failing to fetch as done, taking them
/// out of the to-fetch pool for good. Nothing proves a requested id is a public match, and the
/// workers don't report why Steam refused it: most such ids are private or bot lobbies, or
/// made up.
pub(crate) fn abandon_requested_matches(state: &AppState, match_ids: &[u64]) {
    let rows: Vec<PendingMatchRow> = match_ids
        .iter()
        .filter(|id| (MIN_MATCH_ID..u64::from(u32::MAX)).contains(id))
        .map(|&id| PendingMatchRow::invalid(id))
        .collect();
    if !rows.is_empty() {
        state.batchers.pending_match_insert.try_insert(rows);
    }
}

/// Queues the requested matches that have no metadata and that `pending_matches` doesn't know
/// yet.
pub(crate) async fn queue_unknown_matches(
    state: &AppState,
    match_ids: &[u64],
) -> clickhouse::error::Result<()> {
    if match_ids.is_empty() {
        return Ok(());
    }
    let ids = id_list(match_ids);
    // A literal array of today's match ids is Array(UInt32), which doesn't decode as u64.
    let query = format!(
        "SELECT match_id FROM (SELECT arrayJoin(CAST([{ids}], 'Array(UInt64)')) AS match_id) \
         WHERE match_id NOT IN (SELECT match_id FROM match_player WHERE match_id IN ({ids})) \
           AND match_id NOT IN (SELECT match_id FROM pending_matches WHERE match_id IN ({ids})) \
         SETTINGS log_comment = 'queue_unknown_matches'"
    );
    let unknown: Vec<u64> = state.ch_client_ro.query(&query).fetch_all().await?;
    if !unknown.is_empty() {
        debug!(?unknown, "queueing requested matches");
        queue_requested_matches(state, &unknown).await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::proptest_utils::assert_valid_sql;

    #[test]
    fn estimated_start_time_query_is_valid_sql() {
        let sql = EstimatedStartTimeQuery::build_query(&[31_307_609, 70_156_416]);
        assert_valid_sql(&sql);
        // An id literal that fits UInt32 is typed UInt32, which the u64 row type rejects.
        assert!(sql.starts_with("SELECT toUInt64(requested) AS requested_id,"));
    }
}
