use tracing::debug;

pub async fn get_rating_period_starting_day(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<u32> {
    debug!("Fetching rating period starting id");
    ch_client
        .query(
            r#"
    SELECT toStartOfDay(start_time) as day
    FROM match_info
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND average_badge_team0 IS NOT NULL
        AND average_badge_team1 IS NOT NULL
        AND start_time > '2025-01-01'
        AND match_id NOT IN (SELECT match_id FROM glicko_history)
    GROUP BY day
    HAVING COUNT(DISTINCT match_id) >= 100
    ORDER BY day
    LIMIT 1
    "#,
        )
        .fetch_one::<u32>()
        .await
}
