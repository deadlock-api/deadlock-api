use cached::UnboundCache;
use cached::proc_macro::cached;
use chrono::{DateTime, Utc};
use clickhouse::Client;
use serde::{Deserialize, Serialize};

#[derive(clickhouse::Row, Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Glicko2HistoryEntry {
    pub account_id: u32,
    pub match_id: u64,
    pub rating: f64,
    pub rating_deviation: f64,
    #[serde(with = "clickhouse::serde::chrono::datetime")]
    pub start_time: DateTime<Utc>,
}

impl Glicko2HistoryEntry {
    pub async fn query_latest_before_match_id(
        ch_client: &Client,
        match_id: u64,
    ) -> clickhouse::error::Result<Vec<Self>> {
        ch_client
            .query(
                r#"
                    SELECT ?fields FROM glicko
                    WHERE match_id < ?
                    ORDER BY match_id DESC
                    LIMIT 1 BY account_id
                "#,
            )
            .bind(match_id)
            .fetch_all()
            .await
    }
}

#[derive(clickhouse::Row, Debug, Clone, PartialEq, Eq, Hash, Deserialize, Serialize)]
pub struct CHMatch {
    pub match_id: u64,
    #[serde(with = "clickhouse::serde::chrono::datetime")]
    pub start_time: DateTime<Utc>,
    pub team0_players: Vec<u32>,
    pub team1_players: Vec<u32>,
    pub winning_team: u8,
}

impl CHMatch {
    pub async fn query_rating_period(
        ch_client: &Client,
        start_time: u32,
        end_time: u32,
    ) -> clickhouse::error::Result<Vec<Self>> {
        ch_client
            .query(
                r#"
SELECT match_id,
       any(mi.start_time)                       as start_time,
       groupArrayIf(account_id, team = 'Team0') as team0_players,
       groupArrayIf(account_id, team = 'Team1') as team1_players,
       any(winning_team)                        as winning_team
FROM match_player FINAL
    INNER JOIN match_info mi FINAL USING (match_id)
WHERE match_mode IN ('Ranked', 'Unranked')
  AND mi.start_time >= ? AND mi.start_time < ?
  AND low_pri_pool != true
GROUP BY match_id
HAVING length(team0_players) = 6 AND length(team1_players) = 6
ORDER BY match_id
            "#,
            )
            .bind(start_time)
            .bind(end_time)
            .fetch_all()
            .await
    }
}

#[cached(
    ty = "UnboundCache<String, Vec<CHMatch>>",
    result = true,
    create = "{ UnboundCache::new() }",
    convert = r#"{ format!("{path}") }"#,
    sync_writes = "by_key",
    key = "String"
)]
async fn load_file(path: &str) -> anyhow::Result<Vec<CHMatch>> {
    let matches = tokio::fs::read(path).await?;
    Ok(serde_json::from_slice(&matches)?)
}

pub async fn query_rating_period(
    ch_client: &Client,
    start_time: u32,
    end_time: u32,
) -> anyhow::Result<Vec<CHMatch>> {
    let cache_path = format!("data/rating_period_{start_time}_{end_time}.json");
    if let Ok(matches) = load_file(&cache_path).await {
        return Ok(matches);
    }
    let result = ch_client
        .query(
            r#"
SELECT match_id,
       any(mi.start_time)                       as start_time,
       groupArrayIf(account_id, team = 'Team0') as team0_players,
       groupArrayIf(account_id, team = 'Team1') as team1_players,
       any(winning_team)                        as winning_team
FROM match_player FINAL
    INNER JOIN match_info mi FINAL USING (match_id)
WHERE match_mode IN ('Ranked', 'Unranked')
  AND mi.start_time >= ? AND mi.start_time < ?
  AND low_pri_pool != true
GROUP BY match_id
HAVING length(team0_players) = 6 AND length(team1_players) = 6
ORDER BY match_id
            "#,
        )
        .bind(start_time)
        .bind(end_time)
        .fetch_all()
        .await?;
    tokio::fs::write(&cache_path, serde_json::to_vec(&result)?).await?;
    Ok(result)
}
