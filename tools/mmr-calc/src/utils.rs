use crate::types::{CHMatch, PlayerHeroMMR, PlayerMMR};
use clickhouse::query::RowCursor;
use tracing::debug;

const RANKS: [u32; 67] = [
    0, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36, 41, 42, 43, 44, 45,
    46, 51, 52, 53, 54, 55, 56, 61, 62, 63, 64, 65, 66, 71, 72, 73, 74, 75, 76, 81, 82, 83, 84, 85,
    86, 91, 92, 93, 94, 95, 96, 101, 102, 103, 104, 105, 106, 111, 112, 113, 114, 115, 116,
];

pub fn rank_to_player_score(rank: u32) -> f64 {
    RANKS.iter().position(|&r| r == rank).unwrap() as f64
}

pub(crate) async fn get_matches_starting_from(
    ch_client: &clickhouse::Client,
    start_id: u64,
) -> clickhouse::error::Result<RowCursor<CHMatch>> {
    debug!("Fetching matches starting from {}", start_id);
    ch_client
        .query(
            r#"
    SELECT match_id,
           groupArrayIf((account_id, hero_id), team = 'Team0') as team0_players,
           groupArrayIf((account_id, hero_id), team = 'Team1') as team1_players,
           any(assumeNotNull(average_badge_team0))                 as avg_badge_team0,
           any(assumeNotNull(average_badge_team1))                 as avg_badge_team1,
           any(winning_team)                        as winning_team
    FROM match_player FINAL
        INNER JOIN match_info mi FINAL USING (match_id)
    WHERE match_mode IN ('Ranked', 'Unranked')
      AND average_badge_team0 IS NOT NULL
      AND average_badge_team1 IS NOT NULL
      AND match_id > ?
    GROUP BY match_id
    HAVING length(team0_players) = 6 AND length(team1_players) = 6
    ORDER BY match_id
    "#,
        )
        .bind(start_id)
        .fetch()
}

pub(crate) async fn get_regression_starting_id(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<u64> {
    debug!("Fetching regression starting id");
    let min_created_at = ch_client
        .query(
            r#"
WITH last_mmr AS (
    SELECT match_id
    FROM mmr_history
    ORDER BY match_id DESC
    LIMIT 1
)
SELECT created_at
FROM match_info
WHERE match_id IN last_mmr
LIMIT 1
    "#,
        )
        .fetch_one::<u32>()
        .await
        .unwrap_or_default();

    ch_client
        .query(
            r#"
    SELECT match_id
    FROM match_info
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND average_badge_team0 IS NOT NULL
        AND average_badge_team1 IS NOT NULL
        AND created_at > ?
        AND match_id > 28626948
    ORDER BY created_at
    LIMIT 1
    "#,
        )
        .bind(min_created_at)
        .fetch_one::<u64>()
        .await
}

pub(crate) async fn get_hero_regression_starting_id(
    ch_client: &clickhouse::Client,
) -> clickhouse::error::Result<u64> {
    debug!("Fetching hero regression starting id");
    let min_created_at = ch_client
        .query(
            r#"
WITH last_mmr AS (
    SELECT match_id
    FROM hero_mmr_history
    ORDER BY match_id DESC
    LIMIT 1
)
SELECT created_at
FROM match_info
WHERE match_id IN last_mmr
LIMIT 1
    "#,
        )
        .fetch_one::<u32>()
        .await
        .unwrap_or_default();

    ch_client
        .query(
            r#"
    SELECT match_id
    FROM match_info
    WHERE match_mode IN ('Ranked', 'Unranked')
        AND average_badge_team0 IS NOT NULL
        AND average_badge_team1 IS NOT NULL
        AND created_at > ?
        AND match_id > 28626948
    ORDER BY created_at
    LIMIT 1
    "#,
        )
        .bind(min_created_at)
        .fetch_one::<u64>()
        .await
}

pub(crate) async fn get_all_player_mmrs(
    ch_client: &clickhouse::Client,
    at_match_id: u64,
) -> clickhouse::error::Result<Vec<PlayerMMR>> {
    debug!("Fetching all player mmrs at match id {}", at_match_id);
    ch_client
        .query(
            r#"
    SELECT match_id, account_id, player_score
    FROM mmr_history
    WHERE match_id <= ?
    ORDER BY account_id, match_id DESC
    LIMIT 1 BY account_id
    "#,
        )
        .bind(at_match_id)
        .fetch_all()
        .await
}

pub(crate) async fn get_all_player_hero_mmrs(
    ch_client: &clickhouse::Client,
    at_match_id: u64,
) -> clickhouse::error::Result<Vec<PlayerHeroMMR>> {
    debug!("Fetching all player mmrs at match id {}", at_match_id);
    ch_client
        .query(
            r#"
    SELECT match_id, account_id, hero_id, player_score
    FROM hero_mmr_history
    WHERE match_id <= ?
    ORDER BY account_id, match_id DESC
    LIMIT 1 BY (account_id, hero_id)
    "#,
        )
        .bind(at_match_id)
        .fetch_all()
        .await
}

pub(crate) async fn insert_mmrs(
    ch_client: &clickhouse::Client,
    mmrs: &[PlayerMMR],
) -> clickhouse::error::Result<()> {
    if mmrs.is_empty() {
        return Ok(());
    }
    debug!("Inserting {} mmrs", mmrs.len());
    let mut inserter = ch_client.insert("mmr_history")?;
    for mmr in mmrs {
        inserter.write(mmr).await?;
    }
    inserter.end().await
}

pub(crate) async fn insert_hero_mmrs(
    ch_client: &clickhouse::Client,
    mmrs: &[PlayerHeroMMR],
) -> clickhouse::error::Result<()> {
    if mmrs.is_empty() {
        return Ok(());
    }
    debug!("Inserting {} hero mmrs", mmrs.len());
    let mut inserter = ch_client.insert("hero_mmr_history")?;
    for mmr in mmrs {
        inserter.write(mmr).await?;
    }
    inserter.end().await
}
