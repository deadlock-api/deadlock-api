use std::sync::Arc;

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Quota, RateLimitClient};

#[derive(Clone)]
pub(crate) struct RateLimitState {
    pub(crate) client: RateLimitClient,
    pub(crate) key: &'static str,
    pub(crate) quotas: Arc<[Quota]>,
}

impl RateLimitState {
    pub(crate) fn new(
        client: RateLimitClient,
        key: &'static str,
        quotas: impl Into<Arc<[Quota]>>,
    ) -> Self {
        Self {
            client,
            key,
            quotas: quotas.into(),
        }
    }
}

pub(crate) async fn rate_limit(
    State(state): State<RateLimitState>,
    rate_limit_key: RateLimitKey,
    request: Request,
    next: Next,
) -> Response {
    let status = match state
        .client
        .apply_limits(&rate_limit_key, state.key, &state.quotas)
        .await
    {
        Ok(s) => s,
        Err(e) => return e.into_response(),
    };

    let mut response = next.run(request).await;
    if let Some(status) = status {
        for (key, value) in status.response_headers() {
            if let Some(key) = key {
                response.headers_mut().insert(key, value);
            }
        }
    }
    response
}
