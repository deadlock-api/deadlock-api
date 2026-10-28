use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse as _, Response};

use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{RateLimit, RateLimitClient, RateLimitHeaders};

/// Applies one policy to every route of a router.
#[derive(Clone)]
pub(crate) struct RateLimitState {
    pub(crate) client: RateLimitClient,
    pub(crate) limit: RateLimit<'static>,
}

pub(crate) async fn rate_limit(
    State(RateLimitState { client, limit }): State<RateLimitState>,
    rate_limit_key: RateLimitKey,
    request: Request,
    next: Next,
) -> Response {
    match client.check(&rate_limit_key, limit).await {
        Ok(status) => (status.map(RateLimitHeaders), next.run(request).await).into_response(),
        Err(e) => e.into_response(),
    }
}
