//! Prioritization module for checking if Steam accounts are prioritized.
//!
//! Prioritized accounts are those in the `prioritized_steam_accounts` table that are either
//! linked to an active patron or manually assigned (no patron link).

use sqlx::{Pool, Postgres};

/// Checks if a single Steam account is prioritized.
///
/// Returns `true` if the account is in the prioritization table, not deleted,
/// and is either not linked to a patron or linked to an active one.
pub async fn is_prioritized(pool: &Pool<Postgres>, steam_id3: i64) -> anyhow::Result<bool> {
    Ok(!get_prioritized_from_list(pool, &[steam_id3])
        .await?
        .is_empty())
}

/// Returns which `steam_id3` values from the input list are prioritized.
///
/// Uses a batch query with `= ANY($1)` for efficiency.
/// Returns an empty Vec if the input list is empty.
pub async fn get_prioritized_from_list(
    pool: &Pool<Postgres>,
    steam_id3_list: &[i64],
) -> anyhow::Result<Vec<i64>> {
    if steam_id3_list.is_empty() {
        return Ok(Vec::new());
    }

    let result = sqlx::query_scalar!(
        r#"
        SELECT psa.steam_id3
        FROM prioritized_steam_accounts psa
        WHERE psa.steam_id3 = ANY($1)
          AND psa.deleted_at IS NULL
        "#,
        steam_id3_list
    )
    .fetch_all(pool)
    .await;

    match result {
        Ok(ids) => Ok(ids),
        Err(e) => {
            tracing::error!(
                count = steam_id3_list.len(),
                error = %e,
                "Failed to batch check prioritization status"
            );
            Err(e.into())
        }
    }
}

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
    .await;

    match result {
        Ok(ids) => Ok(ids),
        Err(e) => {
            tracing::error!(error = %e, "Failed to fetch all prioritized accounts");
            Err(e.into())
        }
    }
}

/// Returns all currently prioritized Steam accounts that are friends with a bot.
///
/// Only includes accounts that have an entry in `bot_friends`, returning both the
/// `steam_id3` and the `bot_id` (username) of the befriended bot.
pub async fn get_all_prioritized_accounts_with_bots(
    pool: &Pool<Postgres>,
) -> anyhow::Result<Vec<(i64, String)>> {
    let result: Result<Vec<(i64, String)>, sqlx::Error> = sqlx::query_as(
        r"
        SELECT psa.steam_id3, bf.bot_id
        FROM prioritized_steam_accounts psa
        INNER JOIN bot_friends bf ON bf.friend_id = psa.steam_id3
        WHERE psa.deleted_at IS NULL
        ",
    )
    .fetch_all(pool)
    .await;

    match result {
        Ok(rows) => Ok(rows),
        Err(e) => {
            tracing::error!(error = %e, "Failed to fetch prioritized accounts with bots");
            Err(e.into())
        }
    }
}
