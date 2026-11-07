//! What the `ClickHouse` queries behind a response cost.
//!
//! Inside [`track`] (scoped per request by [`crate::middleware::ch_cost::ch_cost_headers`]),
//! every query run through [`TrackedQuery`] adds its `X-ClickHouse-Summary` to a task-local
//! [`ChCost`], which the middleware reports as `X-CH-*` response headers and hands to
//! `track_requests` for `request_logs`. Tracked queries run with `wait_end_of_query=1`:
//! `ClickHouse` sends the summary before the body, so without it the summary only covers the
//! work done until the first output block.
//!
//! Not seen: queries run from other tasks (e.g. the `BatchQuery` loops), and cache hits, which
//! cost `ClickHouse` nothing. Concurrent misses of one cached query share a single run, whose cost
//! goes to the request that ran it.

use core::cell::Cell;

use axum::http::{HeaderMap, HeaderName, HeaderValue};
use clickhouse::query::{BytesCursor, Query};
use clickhouse::{QuerySummary, RowOwned, RowRead};
use tokio::io::{AsyncBufReadExt as _, Lines};

tokio::task_local! {
    static COST: Cell<ChCost>;
}

/// The summed cost of the queries recorded in one [`track`] scope.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ChCost {
    pub(crate) queries: u64,
    pub(crate) elapsed_ns: u64,
    pub(crate) read_rows: u64,
    pub(crate) read_bytes: u64,
    /// The highest peak memory of any one query; queries mostly run one after the other.
    pub(crate) peak_memory_bytes: u64,
}

impl ChCost {
    /// Whether no query was recorded.
    pub(crate) const fn is_empty(&self) -> bool {
        self.queries == 0
    }

    fn add(mut self, summary: Option<&QuerySummary>) -> Self {
        self.queries = self.queries.saturating_add(1);
        if let Some(summary) = summary {
            let sum = |total: u64, value: Option<u64>| total.saturating_add(value.unwrap_or(0));
            self.elapsed_ns = sum(self.elapsed_ns, summary.elapsed_ns());
            self.read_rows = sum(self.read_rows, summary.read_rows());
            self.read_bytes = sum(self.read_bytes, summary.read_bytes());
            self.peak_memory_bytes = self
                .peak_memory_bytes
                .max(summary.memory_usage().unwrap_or(0));
        }
        self
    }

    /// Writes the cost as `X-CH-*` headers.
    pub(crate) fn insert_headers(&self, headers: &mut HeaderMap) {
        let elapsed_ms = format!(
            "{}.{:03}",
            self.elapsed_ns / 1_000_000,
            self.elapsed_ns / 1_000 % 1_000
        );
        let mut insert = |name, value| headers.insert(HeaderName::from_static(name), value);
        insert("x-ch-queries", self.queries.into());
        // Digits and a dot are always a valid header value.
        if let Ok(elapsed_ms) = HeaderValue::try_from(elapsed_ms) {
            insert("x-ch-elapsed-ms", elapsed_ms);
        }
        insert("x-ch-read-rows", self.read_rows.into());
        insert("x-ch-read-bytes", self.read_bytes.into());
        insert("x-ch-peak-memory-bytes", self.peak_memory_bytes.into());
    }
}

/// Runs `future` and returns its output with the cost of the queries recorded while it ran.
/// Queries recorded from other tasks (e.g. `tokio::spawn`) are not seen.
pub(crate) async fn track<F: Future>(future: F) -> (F::Output, ChCost) {
    COST.scope(Cell::new(ChCost::default()), async move {
        let output = future.await;
        (output, COST.try_with(Cell::get).unwrap_or_default())
    })
    .await
}

/// Records one query with its summary, if `ClickHouse` sent one; a no-op outside [`track`].
pub(crate) fn record(summary: Option<&QuerySummary>) {
    _ = COST.try_with(|cost| cost.set(cost.get().add(summary)));
}

/// The fetches of [`Query`], recording their cost (see the [module docs](self)).
pub(crate) trait TrackedQuery {
    async fn fetch_all_tracked<T: RowOwned + RowRead>(self) -> clickhouse::error::Result<Vec<T>>;
    async fn fetch_one_tracked<T: RowOwned + RowRead>(self) -> clickhouse::error::Result<T>;
    async fn fetch_optional_tracked<T: RowOwned + RowRead>(
        self,
    ) -> clickhouse::error::Result<Option<T>>;
    /// The result in `format`, line by line; records once the first line is read.
    fn fetch_lines_tracked(self, format: &str) -> clickhouse::error::Result<TrackedLines>;
}

impl TrackedQuery for Query {
    async fn fetch_all_tracked<T: RowOwned + RowRead>(self) -> clickhouse::error::Result<Vec<T>> {
        let mut cursor = wait_end_of_query(self).fetch::<T>()?;
        let mut rows = Vec::new();
        while let Some(row) = cursor.next().await? {
            rows.push(row);
        }
        record(cursor.summary());
        Ok(rows)
    }

    async fn fetch_one_tracked<T: RowOwned + RowRead>(self) -> clickhouse::error::Result<T> {
        self.fetch_optional_tracked()
            .await?
            .ok_or(clickhouse::error::Error::RowNotFound)
    }

    async fn fetch_optional_tracked<T: RowOwned + RowRead>(
        self,
    ) -> clickhouse::error::Result<Option<T>> {
        let mut cursor = wait_end_of_query(self).fetch::<T>()?;
        let row = cursor.next().await?;
        record(cursor.summary());
        Ok(row)
    }

    fn fetch_lines_tracked(self, format: &str) -> clickhouse::error::Result<TrackedLines> {
        Ok(TrackedLines {
            lines: wait_end_of_query(self).fetch_bytes(format)?.lines(),
            recorded: false,
        })
    }
}

/// The lines of a [`TrackedQuery::fetch_lines_tracked`] result.
pub(crate) struct TrackedLines {
    lines: Lines<BytesCursor>,
    recorded: bool,
}

impl TrackedLines {
    /// The next line, or `None` at the end. The first call records the query: the response
    /// headers are in by then, and the query has finished (`wait_end_of_query`).
    pub(crate) async fn next_line(&mut self) -> std::io::Result<Option<String>> {
        let line = self.lines.next_line().await;
        if !self.recorded {
            self.recorded = true;
            record(self.lines.get_ref().summary());
        }
        line
    }
}

/// A setting, not SQL, so query cache keys stay the same.
fn wait_end_of_query(query: Query) -> Query {
    query.with_setting("wait_end_of_query", "1")
}

#[cfg(test)]
mod tests {
    use clickhouse::Row;
    use clickhouse::test::{Mock, handlers};
    use serde::{Deserialize, Serialize};

    use super::*;

    #[derive(Debug, Row, Serialize, Deserialize, PartialEq)]
    struct Number {
        n: u64,
    }

    const SUMMARY: &str =
        r#"{"read_rows":"100","read_bytes":"800","elapsed_ns":"2500000","memory_usage":"4096"}"#;

    fn client(mock: &Mock) -> clickhouse::Client {
        clickhouse::Client::default()
            .with_url(mock.url())
            .with_validation(false)
    }

    #[tokio::test]
    async fn sums_queries_and_keeps_the_peak_memory() {
        let mock = Mock::new();
        mock.add(handlers::provide_with_summary(
            [Number { n: 1 }, Number { n: 2 }],
            SUMMARY,
        ));
        mock.add(handlers::provide_with_summary(
            [Number { n: 3 }],
            r#"{"read_rows":"5","read_bytes":"40","elapsed_ns":"1000","memory_usage":"1024"}"#,
        ));
        let client = client(&mock);

        let ((all, one), cost) = track(async {
            let all: Vec<Number> = client.query("SELECT 1").fetch_all_tracked().await.unwrap();
            let one: Number = client.query("SELECT 2").fetch_one_tracked().await.unwrap();
            (all, one)
        })
        .await;

        assert_eq!(all, [Number { n: 1 }, Number { n: 2 }]);
        assert_eq!(one, Number { n: 3 });
        assert_eq!(
            cost,
            ChCost {
                queries: 2,
                elapsed_ns: 2_501_000,
                read_rows: 105,
                read_bytes: 840,
                peak_memory_bytes: 4096,
            }
        );
    }

    #[tokio::test]
    async fn counts_queries_without_a_summary() {
        let mock = Mock::new();
        mock.add(handlers::provide([Number { n: 1 }]));
        let client = client(&mock);

        let (_, cost) = track(async {
            client
                .query("SELECT 1")
                .fetch_optional_tracked::<Number>()
                .await
                .unwrap()
        })
        .await;

        assert_eq!(
            cost,
            ChCost {
                queries: 1,
                ..ChCost::default()
            }
        );
    }

    #[tokio::test]
    async fn lines_record_once_on_the_first_read() {
        let mock = Mock::new();
        // RowBinary of 10u64 is "\n" plus 7 NUL bytes: two lines, either way valid UTF-8.
        mock.add(handlers::provide_with_summary([Number { n: 10 }], SUMMARY));
        let client = client(&mock);

        let (lines, cost) = track(async {
            let mut lines = client
                .query("SELECT 1")
                .fetch_lines_tracked("JSONEachRow")
                .unwrap();
            let mut count = 0;
            while lines.next_line().await.unwrap().is_some() {
                count += 1;
            }
            count
        })
        .await;

        assert_eq!(lines, 2);
        assert_eq!(cost.queries, 1);
        assert_eq!(cost.read_rows, 100);
    }

    #[test]
    fn record_outside_track_is_a_noop() {
        record(None);
    }

    #[tokio::test]
    async fn nested_scopes_do_not_leak() {
        let (inner, outer) = track(async {
            record(None);
            let ((), inner) = track(async { record(None) }).await;
            inner
        })
        .await;
        assert_eq!(inner.queries, 1);
        assert_eq!(outer.queries, 1);
    }

    #[test]
    fn formats_headers() {
        let mut headers = HeaderMap::new();
        ChCost {
            queries: 3,
            elapsed_ns: 12_345_678,
            read_rows: 7,
            read_bytes: 56,
            peak_memory_bytes: 1024,
        }
        .insert_headers(&mut headers);
        let get = |name: &str| headers.get(name).unwrap().to_str().unwrap().to_owned();
        assert_eq!(get("x-ch-queries"), "3");
        assert_eq!(get("x-ch-elapsed-ms"), "12.345");
        assert_eq!(get("x-ch-read-rows"), "7");
        assert_eq!(get("x-ch-read-bytes"), "56");
        assert_eq!(get("x-ch-peak-memory-bytes"), "1024");
    }
}
