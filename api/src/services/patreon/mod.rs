pub(crate) mod client;
pub(crate) mod extractor;
pub(crate) mod jwt;
pub(crate) mod membership;
pub(crate) mod repository;
pub(crate) mod steam_accounts_repository;
pub(crate) mod types;
pub(crate) mod verification_job;
pub(crate) mod webhook_types;

use cached::macros::cached;
use sqlx::{Pool, Postgres};

#[cached(
    ttl = 3600,
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
            WHERE psa.steam_id3 = $1 AND psa.deleted_at IS NULL
        ) AS "exists!"
        "#,
        steam_id3
    )
    .fetch_one(pg_client)
    .await?;

    Ok(result.exists)
}
