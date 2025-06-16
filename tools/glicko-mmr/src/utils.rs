use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use tracing::debug;

#[derive(clickhouse::Row, Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Start {
    #[serde(with = "clickhouse::serde::chrono::date")]
    pub start: NaiveDate,
}

pub async fn get_rating_period_starting_week(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<u32> {
    debug!("Fetching rating period starting id");
    Ok(ch_client
        .query(
            r#"
    WITH t_matches as (SELECT match_id FROM glicko FINAL)
    SELECT toStartOfWeek(start_time) as week
    FROM match_info FINAL
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND start_time >= '2025-01-01'
        AND match_id NOT IN t_matches
    GROUP BY week
    HAVING COUNT(DISTINCT match_id) >= 100
    ORDER BY week
    LIMIT 1
    "#,
        )
        .fetch_one::<Start>()
        .await?
        .start
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp() as u32)
}

const RANKS: [u32; 67] = [
    0, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36, 41, 42, 43, 44, 45,
    46, 51, 52, 53, 54, 55, 56, 61, 62, 63, 64, 65, 66, 71, 72, 73, 74, 75, 76, 81, 82, 83, 84, 85,
    86, 91, 92, 93, 94, 95, 96, 101, 102, 103, 104, 105, 106, 111, 112, 113, 114, 115, 116,
];
pub fn rank_to_rating(rank: u32) -> f64 {
    let rank = rank.clamp(0, 116);
    RANKS.into_iter().position(|r| r == rank).unwrap() as f64
}
pub fn rating_to_rank(rating: f64) -> u32 {
    RANKS[rating.clamp(0.0, 66.0).round() as usize]
}
