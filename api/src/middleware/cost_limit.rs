use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse as _, Response};

use crate::context::AppState;
use crate::services::clickhouse_budget;
use crate::services::rate_limiter::RateLimitHeaders;
use crate::services::rate_limiter::extractor::RateLimitKey;

/// Charges every route of a router the megabytes its `ClickHouse` queries read against the shared
/// [`clickhouse_budget::BUDGET`]: admitted while budget is left (one MB up front), the rest
/// recorded once the response is ready. Needs `ch_cost_headers` outside it to track the reads.
pub(crate) async fn clickhouse_cost(
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
    request: Request,
    next: Next,
) -> Response {
    let _slot = match clickhouse_budget::acquire_slot(&rate_limit_key) {
        Ok(slot) => slot,
        Err(e) => return e.into_response(),
    };
    let status = match clickhouse_budget::admit(&state, &rate_limit_key).await {
        Ok(status) => status,
        Err(e) => return e.into_response(),
    };
    let response = next.run(request).await;
    clickhouse_budget::record(
        &state,
        &rate_limit_key,
        clickhouse_budget::Endpoint::Analytics,
    )
    .await;
    (status.map(RateLimitHeaders), response).into_response()
}
