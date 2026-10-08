//! Prioritization module for checking if Steam accounts are prioritized.
//!
//! Prioritized accounts are those in the `prioritized_steam_accounts` table that are either
//! linked to an active patron or manually assigned (no patron link).

use sqlx::{Pool, Postgres};

/// Returns all currently prioritized Steam account IDs.
///
/// Fetches all `steam_id3` values where the patron is active and the account is not deleted.
pub async fn get_all_prioritized_accounts(pool: &Pool<Postgres>) -> anyhow::Result<Vec<i64>> {
    let result = sqlx::query_scalar!(
        r#"
        SELECT psa.steam_id3
        FROM prioritized_steam_accounts psa
        WHERE psa.deleted_at IS NULL
        "#
    )
    .fetch_all(pool)
    .await
    .inspect_err(|e| tracing::error!(error = %e, "Failed to fetch all prioritized accounts"))?;
    Ok(result)
}

/// Returns all currently prioritized Steam accounts that are friends with a bot.
///
/// Only includes accounts that have an entry in `bot_friends`, returning both the
/// `steam_id3` and the `bot_id` (username) of the befriended bot.
pub async fn get_all_prioritized_accounts_with_bots(
    pool: &Pool<Postgres>,
) -> anyhow::Result<Vec<(i64, String)>> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        r"
        SELECT psa.steam_id3, bf.bot_id
        FROM prioritized_steam_accounts psa
        INNER JOIN bot_friends bf ON bf.friend_id = psa.steam_id3
        WHERE psa.deleted_at IS NULL
        ",
    )
    .fetch_all(pool)
    .await
    .inspect_err(
        |e| tracing::error!(error = %e, "Failed to fetch prioritized accounts with bots"),
    )?;
    Ok(rows)
}
