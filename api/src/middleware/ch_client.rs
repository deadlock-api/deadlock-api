use core::time::Duration;

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse as _, Response};
use tracing::warn;
use uuid::Uuid;

use crate::context::AppState;
use crate::error::APIError;
use crate::services::ch_admission::{CH_CLIENT, Caller};
use crate::services::rate_limiter::extractor::RateLimitKey;

/// Runs the request with its client in [`CH_CLIENT`], so the `ClickHouse` admission limiter can
/// cap the query slots one client holds. Clients are told apart like the rate limiter does: by
/// API key, else by IP or Cloudflare worker.
///
/// Requests with an invalid API key are rejected. Most routes never check the key, so any
/// well-formed UUID would otherwise lift the cap and let one client take every slot.
pub(crate) async fn scope_ch_client(
    State(state): State<AppState>,
    mut key: RateLimitKey,
    req: Request,
    next: Next,
) -> Response {
    if let Some(api_key) = key.api_key {
        match validate_api_key(&state, api_key).await {
            Some(true) => {}
            Some(false) => {
                return APIError::status_msg(StatusCode::FORBIDDEN, "Invalid API key")
                    .into_response();
            }
            // A key that can't be checked keeps the cap: the request still runs, only with a
            // client's share.
            None => key.api_key = None,
        }
    }
    let caller = Caller::new(key.client_id(), key.api_key.is_none());
    CH_CLIENT.scope(caller, next.run(req)).await
}

/// Bounds the Postgres lookup behind an uncached key, so a slow or down Postgres doesn't hold up
/// routes that never touch it.
const KEY_VALIDATION_TIMEOUT: Duration = Duration::from_millis(500);

/// Whether the key is valid, or `None` if it couldn't be checked.
async fn validate_api_key(state: &AppState, api_key: Uuid) -> Option<bool> {
    let validation = state.rate_limit_client.is_api_key_valid(api_key);
    match tokio::time::timeout(KEY_VALIDATION_TIMEOUT, validation).await {
        Ok(Ok(valid)) => Some(valid),
        Ok(Err(e)) => {
            warn!("Failed to validate API key: {e}, capping the client");
            None
        }
        Err(_) => {
            warn!("API key validation timed out, capping the client");
            None
        }
    }
}
