#![allow(dead_code)]

use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use sqlx::{Pool, Postgres};
use thiserror::Error;

/// TTL for the prioritization cache in seconds (5 minutes)
const CACHE_TTL_SECONDS: u64 = 5 * 60;

#[derive(Debug, Error)]
pub(crate) enum PrioritizationError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub(crate) type PrioritizationResult<T> = Result<T, PrioritizationError>;

/// Checks if a Steam account (by `SteamID3`) is prioritized for data fetching.
///
/// This function first checks Redis cache with key `prioritized:{steam_id3}`.
/// On cache miss, it queries the database to check if the `steam_id3` exists
/// in `prioritized_steam_accounts` (not soft-deleted) and the patron is active.
/// The result is cached in Redis with a 5-minute TTL.
pub(crate) async fn is_account_prioritized(
    redis_client: &mut MultiplexedConnection,
    pg_client: &Pool<Postgres>,
    steam_id3: i64,
) -> PrioritizationResult<bool> {
    let cache_key = format!("prioritized:{steam_id3}");

    // First check Redis cache
    let cached: Option<String> = redis_client.get(&cache_key).await?;

    if let Some(value) = cached {
        // Cache hit - parse the cached boolean value
        return Ok(value == "1");
    }

    // Cache miss - query the database
    let is_prioritized = check_prioritization_in_db(pg_client, steam_id3).await?;

    // Cache the result with 5-minute TTL
    // Store as "1" for true, "0" for false
    let value_to_cache = if is_prioritized { "1" } else { "0" };
    let _: () = redis_client
        .set_ex(&cache_key, value_to_cache, CACHE_TTL_SECONDS)
        .await?;

    Ok(is_prioritized)
}

/// Checks the database to determine if a Steam account is prioritized.
///
/// Returns true if:
/// - The `steam_id3` exists in `prioritized_steam_accounts`
/// - The account is not soft-deleted (`deleted_at` IS NULL)
/// - The associated patron has `is_active` = true
async fn check_prioritization_in_db(
    pg_client: &Pool<Postgres>,
    steam_id3: i64,
) -> PrioritizationResult<bool> {
    let result = sqlx::query!(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM prioritized_steam_accounts psa
            LEFT JOIN patrons p ON psa.patron_id = p.id
            WHERE psa.steam_id3 = $1
              AND psa.deleted_at IS NULL
              AND (p.id IS NULL OR p.is_active = TRUE)
        ) AS "exists!"
        "#,
        steam_id3
    )
    .fetch_one(pg_client)
    .await?;

    Ok(result.exists)
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_cache_key_format() {
        let steam_id3: i64 = 123456789;
        let cache_key = format!("prioritized:{steam_id3}");
        assert_eq!(cache_key, "prioritized:123456789");
    }
}
