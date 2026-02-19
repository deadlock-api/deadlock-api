pub(crate) mod client;
pub(crate) mod extractor;
pub(crate) mod jwt;
pub(crate) mod membership;
pub(crate) mod repository;
pub(crate) mod steam_accounts_repository;
pub(crate) mod types;
pub(crate) mod verification_job;
pub(crate) mod webhook_types;

use cached::TimedCache;
use cached::proc_macro::cached;
use sqlx::{Pool, Postgres};

#[cached(
    ty = "TimedCache<i64, bool>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_hours(1)) }",
    result = true,
    convert = "{ steam_id3 }",
    sync_writes = "by_key",
    key = "i64"
)]
pub(crate) async fn is_account_prioritized(
    pg_client: &Pool<Postgres>,
    steam_id3: i64,
) -> Result<bool, sqlx::Error> {
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
