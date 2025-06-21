pub async fn get_start_match_id(ch_client: &clickhouse::Client) -> clickhouse::error::Result<u64> {
    ch_client
        .query(
            r#"
    WITH t_matches as (SELECT match_id FROM glicko FINAL)
    SELECT match_id
    FROM match_info FINAL
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND start_time >= '2025-01-01'
        AND match_id NOT IN t_matches
        AND low_pri_pool != true
    ORDER BY match_id
    LIMIT 1
    "#,
        )
        .fetch_one()
        .await
}
