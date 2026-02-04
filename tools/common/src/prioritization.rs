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
    let result = sqlx::query_scalar!(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM prioritized_steam_accounts psa
            LEFT JOIN patrons p ON psa.patron_id = p.id
            WHERE psa.steam_id3 = $1
              AND psa.deleted_at IS NULL
              AND (psa.patron_id IS NULL OR p.is_active = TRUE)
        ) AS "exists!"
        "#,
        steam_id3
    )
    .fetch_one(pool)
    .await;

    match result {
        Ok(exists) => Ok(exists),
        Err(e) => {
            tracing::error!(steam_id3 = steam_id3, error = %e, "Failed to check prioritization status");
            Err(e.into())
        }
    }
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
        LEFT JOIN patrons p ON psa.patron_id = p.id
        WHERE psa.steam_id3 = ANY($1)
          AND psa.deleted_at IS NULL
          AND (psa.patron_id IS NULL OR p.is_active = TRUE)
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
        LEFT JOIN patrons p ON psa.patron_id = p.id
        WHERE psa.deleted_at IS NULL
          AND (psa.patron_id IS NULL OR p.is_active = TRUE)
        "#
    )
    .fetch_all(pool)
    .await;

    match result {
        Ok(ids) => Ok(ids.into_iter().flatten().collect()),
        Err(e) => {
            tracing::error!(error = %e, "Failed to fetch all prioritized accounts");
            Err(e.into())
        }
    }
}
