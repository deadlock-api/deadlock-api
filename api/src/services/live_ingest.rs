//! The matches the ingest worker has just written, for the live page; read from the Redis
//! stream the worker appends to (`workers/ingest-worker/src/live_feed.rs`).
//!
//! The worker adds an entry per flush, about one a minute: the number of matches written and a
//! sample of at most 300 of them. The live feed polls the stream once a second, and only while
//! someone watches.

use redis::AsyncCommands as _;
use redis::aio::ConnectionManager;
use redis::streams::{StreamId, StreamReadOptions};
use serde::{Deserialize, Serialize};

/// Keep in sync with the ingest worker's `live_feed::STREAM_KEY`.
const STREAM_KEY: &str = "live:ingested-matches";

/// Entries read at once. The worker writes about one a minute, so more only ever wait after a
/// long pause; the newest ones matter.
const READ_COUNT: usize = 5;

/// One written match: `[match_id, start_time, duration_s, game_mode, match_mode,
/// average_badge, winning_team, region, team0_hero_ids, team1_hero_ids]`, as the worker writes
/// it. Parsed rather than passed through, so only this shape reaches viewers.
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

/// One flush of the worker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct IngestEntry {
    /// When it was written, unix ms (the stream entry's id).
    pub(crate) t: u64,
    /// Matches written, sampled or not.
    pub(crate) n: u64,
    /// The sampled matches.
    m: Vec<IngestedMatch>,
}

/// A stream position and the entry there.
pub(crate) struct Read {
    pub(crate) id: String,
    pub(crate) entry: Option<IngestEntry>,
}

/// The newest `count` entries, oldest first: the history to start reading after.
pub(crate) async fn latest(
    redis: &mut ConnectionManager,
    count: usize,
) -> redis::RedisResult<Vec<Read>> {
    let reply: redis::streams::StreamRangeReply =
        redis.xrevrange_count(STREAM_KEY, "+", "-", count).await?;
    Ok(reply.ids.into_iter().rev().map(read).collect())
}

/// The entries after `id`, oldest first.
pub(crate) async fn after(
    redis: &mut ConnectionManager,
    id: &str,
) -> redis::RedisResult<Vec<Read>> {
    let options = StreamReadOptions::default().count(READ_COUNT);
    let reply: Option<redis::streams::StreamReadReply> =
        redis.xread_options(&[STREAM_KEY], &[id], &options).await?;
    Ok(reply
        .into_iter()
        .flat_map(|reply| reply.keys)
        .flat_map(|key| key.ids)
        .map(read)
        .collect())
}

/// An entry the worker did not write as expected still moves the position past it.
fn read(stream_id: StreamId) -> Read {
    let entry = parse(&stream_id);
    Read {
        id: stream_id.id,
        entry,
    }
}

fn parse(stream_id: &StreamId) -> Option<IngestEntry> {
    let t = stream_id.id.split_once('-')?.0.parse().ok()?;
    let n = stream_id.get("n")?;
    let m = serde_json::from_str(&stream_id.get::<String>("m")?).ok()?;
    Some(IngestEntry { t, n, m })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use redis::Value;

    use super::*;

    fn stream_id(id: &str, fields: &[(&str, &str)]) -> StreamId {
        StreamId {
            id: id.to_owned(),
            map: fields
                .iter()
                .map(|(k, v)| ((*k).to_owned(), Value::BulkString(v.as_bytes().to_vec())))
                .collect::<HashMap<_, _>>(),
            milliseconds_elapsed_from_delivery: None,
            delivered_count: None,
        }
    }

    #[test]
    fn parses_the_workers_entries() {
        let id = stream_id(
            "1763390000123-0",
            &[
                ("n", "812"),
                (
                    "m",
                    r#"[[42,1700000000,1800,1,4,81,1,"eu_west",[9,5],[7]]]"#,
                ),
            ],
        );
        let entry = parse(&id).unwrap();
        assert_eq!(entry.t, 1_763_390_000_123);
        assert_eq!(entry.n, 812);
        assert_eq!(
            serde_json::to_string(&entry.m).unwrap(),
            r#"[[42,1700000000,1800,1,4,81,1,"eu_west",[9,5],[7]]]"#
        );
    }

    #[test]
    fn skips_malformed_entries() {
        assert!(parse(&stream_id("1-0", &[("n", "1"), ("m", "[[1,2]]")])).is_none());
        assert!(parse(&stream_id("1-0", &[("m", "[]")])).is_none());
        assert!(parse(&stream_id("junk", &[("n", "1"), ("m", "[]")])).is_none());
    }
}
