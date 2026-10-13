use std::sync::Arc;

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::services::ch_admission::{CH_CLIENT, ChClient};
use crate::services::rate_limiter::extractor::RateLimitKey;

/// Runs the request with its client in [`CH_CLIENT`], so the `ClickHouse` admission limiter can
/// cap the query slots one client holds. Clients are told apart like the rate limiter does: by
/// API key, else by IP or Cloudflare worker.
pub(crate) async fn scope_ch_client(key: RateLimitKey, req: Request, next: Next) -> Response {
    let client = ChClient {
        id: Arc::from(key.client_id()),
        capped: key.api_key.is_none(),
    };
    CH_CLIENT.scope(client, next.run(req)).await
}
