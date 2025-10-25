use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use itertools::Itertools;

use crate::context::AppState;
use crate::utils::parse::steamid3_to_steamid64;

pub(crate) async fn protected_user_accounts(
    State(AppState { pg_client, .. }): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let protected_users = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(&pg_client)
        .await
        .unwrap_or_default();
    let protected_users = protected_users
        .into_iter()
        .map(|r| r.steam_id)
        .map(i32::cast_unsigned)
        .collect_vec();

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

    let path = request.uri().path().as_bytes().to_vec();

    // Check Path for Protected User Accounts
    let is_protected = search_bytes_steamid3
        .iter()
        .any(|s| memchr::memmem::find(&path, s).is_some())
        || search_bytes_steamid64
            .iter()
            .any(|s| memchr::memmem::find(&path, s).is_some());
    if is_protected
        && let Ok(resp) = Response::builder()
            .status(StatusCode::UNAVAILABLE_FOR_LEGAL_REASONS)
            .body("User protected".into())
    {
        return resp;
    }

    next.run(request).await
}
