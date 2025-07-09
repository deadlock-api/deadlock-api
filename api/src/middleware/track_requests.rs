use core::str::FromStr;
use std::borrow::ToOwned;
use std::time::Instant;

use axum::extract::{MatchedPath, Request, State};
use axum::middleware::Next;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use uuid::Uuid;

use crate::context::AppState;
use crate::middleware::api_key::extract_api_key;

pub(crate) async fn track_requests(
    State(AppState { pg_client, .. }): State<AppState>,
    matched_path: MatchedPath,
    req: Request,
    next: Next,
) -> impl IntoResponse {
    let method = req.method().clone();
    let api_key =
        extract_api_key(&req).and_then(|s| s.to_str().ok().map(std::borrow::ToOwned::to_owned));
    let user_id = if let Some(ref api_key) = api_key
        && let Ok(api_key) = Uuid::from_str(api_key.strip_prefix("HEXE-").unwrap_or(api_key))
    {
        get_user_id(&pg_client, api_key).await
    } else {
        None
    };
    let mut query = req
        .uri()
        .query()
        .map(std::borrow::ToOwned::to_owned)
        .unwrap_or_default();
    if let Some(ref api_key) = api_key {
        query = query.replace(api_key, "HEXE-<API_KEY>");
    }

    let start = Instant::now();
    let response = next.run(req).await;
    let duration = start.elapsed();
    let labels = [
        ("method", method.to_string()),
        ("endpoint", matched_path.as_str().to_owned()),
        ("query", query),
        ("status", response.status().to_string()),
        ("user_id", user_id.unwrap_or("unknown".to_owned())),
    ];
    metrics::counter!("api_requests", &labels).increment(1);
    metrics::histogram!("api_request_duration_seconds", &labels).record(duration.as_secs_f64());
    response
}

#[cached(
    ty = "TimedCache<Uuid, Option<String>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    convert = "{ api_key }",
    sync_writes = "by_key",
    key = "Uuid"
)]
async fn get_user_id(pg_client: &sqlx::PgPool, api_key: Uuid) -> Option<String> {
    sqlx::query!("SELECT user_id FROM api_keys WHERE key = $1", api_key)
        .fetch_one(pg_client)
        .await
        .ok()
        .map(|row| row.user_id.to_string())
}
