use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::{IntoResponse as _, Response};

use crate::context::AppState;
use crate::services::clickhouse_budget;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{RateLimitHeaders, Status};

/// Charges every route of a router what its `ClickHouse` queries cost against the shared
/// [`clickhouse_budget::BUDGET`]: admitted while budget is left (1 core-ms up front), the rest
/// charged once the queries show up in `system.query_log`. Cached responses cost only the 1
/// core-ms.
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
    let status: Option<Status> = match state
        .rate_limit_client
        .check(&rate_limit_key, clickhouse_budget::BUDGET)
        .await
    {
        Ok(status) => status,
        Err(e) => return e.into_response(),
    };
    let response = clickhouse_budget::charged(&rate_limit_key, next.run(request)).await;
    (status.map(RateLimitHeaders), response).into_response()
}
