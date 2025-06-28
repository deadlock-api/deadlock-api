use chrono::{DateTime, Utc};
use clickhouse::Client;
use serde::{Deserialize, Serialize};

#[derive(clickhouse::Row, Debug, Clone, PartialEq, Deserialize, Serialize)]
pub struct Glicko2HistoryEntry {
    pub account_id: u32,
    pub match_id: u64,
    pub rating_mu: f64,
    pub rating_phi: f64,
    pub rating_sigma: f64,
    #[serde(with = "clickhouse::serde::chrono::datetime")]
    pub start_time: DateTime<Utc>,
}

impl Glicko2HistoryEntry {
    pub async fn query_before_match_id(
        ch_client: &Client,
        match_id: u64,
    ) -> clickhouse::error::Result<Vec<Self>> {
        ch_client
            .query(
                r"
                    SELECT ?fields FROM glicko
                    WHERE match_id < ?
                    ORDER BY match_id DESC
                    LIMIT 1 BY account_id
                ",
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
    pub avg_badge_team0: u32,
    pub avg_badge_team1: u32,
    pub winning_team: u8,
}

impl CHMatch {
    pub async fn query_matches_after(
        ch_client: &Client,
        match_id: u64,
        limit: u64,
    ) -> clickhouse::error::Result<Vec<Self>> {
        ch_client
            .query(
                r"
SELECT match_id,
       any(mi.start_time)                       as start_time,
       groupArrayIf(account_id, team = 'Team0') as team0_players,
       groupArrayIf(account_id, team = 'Team1') as team1_players,
       any(assumeNotNull(average_badge_team0))  as avg_badge_team0,
       any(assumeNotNull(average_badge_team1))  as avg_badge_team1,
       any(winning_team)                        as winning_team
FROM match_player FINAL
    INNER JOIN match_info mi FINAL USING (match_id)
WHERE match_mode IN ('Ranked', 'Unranked')
  AND average_badge_team0 IS NOT NULL
  AND average_badge_team1 IS NOT NULL
  AND match_id >= ?
  AND low_pri_pool != true
GROUP BY match_id
HAVING length(team0_players) = 6 AND length(team1_players) = 6
ORDER BY match_id
LIMIT ?
            ",
            )
            .bind(match_id)
            .bind(limit)
            .fetch_all()
            .await
    }
}
