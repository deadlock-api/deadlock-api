use axum::body;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use cached::TimedCache;
use cached::proc_macro::cached;
use itertools::Itertools;

use crate::context::AppState;
use crate::utils::parse::steamid3_to_steamid64;

#[cached(
    ty = "TimedCache<u8, Vec<u32>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(24 * 60 * 60)) }",
    result = true,
    convert = "{ 0 }",
    sync_writes = "default"
)]
async fn get_protected_users(ph_client: &sqlx::Pool<sqlx::Postgres>) -> sqlx::Result<Vec<u32>> {
    let protected_users = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(ph_client)
        .await?
        .into_iter()
        .map(|r| r.steam_id)
        .map(i32::cast_unsigned)
        .collect_vec();
    Ok(protected_users)
}

pub(crate) async fn protected_user_accounts(
    State(AppState { pg_client, .. }): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let protected_users = get_protected_users(&pg_client).await.unwrap_or_default();

    let search_bytes_steamid3: Vec<Vec<u8>> = protected_users
        .iter()
        .copied()
        .map(|s| s.to_string())
        .map(String::into_bytes)
        .collect_vec();
    let search_bytes_steamid64: Vec<Vec<u8>> = protected_users
        .iter()
        .copied()
        .map(steamid3_to_steamid64)
        .map(|s| s.to_string())
        .map(String::into_bytes)
        .collect_vec();
    let mut search_bytes = search_bytes_steamid3
        .iter()
        .chain(search_bytes_steamid64.iter());

    let path = request.uri().path().as_bytes().to_vec();

    let is_protected = search_bytes.any(|s| memchr::memmem::find(&path, s).is_some());
    if is_protected
        && let Ok(resp) = Response::builder()
            .status(StatusCode::UNAVAILABLE_FOR_LEGAL_REASONS)
            .body("User protected".into())
    {
        return resp;
    }

    let response = next.run(request).await;
    let (parts, body) = response.into_parts();

    let body_bytes: Vec<u8> = body::to_bytes(body, usize::MAX)
        .await
        .unwrap_or_default()
        .to_vec();
    let mut modified_body = body_bytes.clone();
    for s in search_bytes {
        let mut start = 0;
        while let Some(pos) = memchr::memmem::find(&modified_body[start..], s) {
            for i in 0..s.len() {
                modified_body[start + pos + i] = b'0';
            }
            start += pos + s.len();
        }
    }
    Response::from_parts(parts, modified_body.into())
}
