use crate::services::rate_limiter::extractor::RateLimitKey;
use sqlx::{Pool, Postgres};
use tracing::warn;

pub(crate) async fn check_api_key_is_esports_ingest_key(
    pg_client: &Pool<Postgres>,
    rate_limit_key: RateLimitKey,
) -> sqlx::Result<bool> {
    let Some(api_key) = rate_limit_key.api_key else {
        warn!("API-Key required!");
        return Ok(false);
    };
    Ok(sqlx::query!(
        "SELECT COUNT(*) as count FROM api_keys WHERE key = $1 AND disabled IS false AND esports_ingest IS true",
        api_key
    )    .fetch_one(pg_client)
        .await?
        .count
        .is_some_and(|c| c > 0))
}
