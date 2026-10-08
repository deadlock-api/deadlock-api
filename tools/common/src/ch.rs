//! Small `ClickHouse` helpers shared by the tools.

use clickhouse::{RowOwned, RowWrite};

/// Writes `rows` to `table` in a single insert.
pub async fn insert_rows<T>(
    client: &clickhouse::Client,
    table: &str,
    rows: &[T],
) -> clickhouse::error::Result<()>
where
    T: RowOwned + RowWrite,
{
    let mut insert = client.insert::<T>(table).await?;
    for row in rows {
        insert.write(row).await?;
    }
    insert.end().await
}

/// The smallest `match_id` of a match started within `max_age` (a `ClickHouse` interval such
/// as `"7 DAY"`), or 0 if there is none: a `match_id` bound that both `match_player` and
/// `match_salts` prune on by primary key. Read in key order, so it stops at the first granule
/// that matches instead of scanning all of `max_age` by `start_time`.
pub async fn fetch_min_match_id_started_within(
    client: &clickhouse::Client,
    max_age: &str,
    log_comment: &str,
) -> clickhouse::error::Result<u64> {
    let min_match_id = client
        .query(&format!(
            "SELECT match_id FROM match_player \
             WHERE start_time > now() - INTERVAL {max_age} \
             ORDER BY match_id LIMIT 1 \
             SETTINGS log_comment = '{log_comment}'"
        ))
        .fetch_optional::<u64>()
        .await?;
    Ok(min_match_id.unwrap_or_default())
}
