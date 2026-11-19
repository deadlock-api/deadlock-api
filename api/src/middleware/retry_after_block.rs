use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::http::header::RETRY_AFTER;
use axum::middleware::Next;
use axum::response::{IntoResponse as _, Response};
use serde_json::json;
use tracing::warn;

use crate::context::AppState;
use crate::error::{APIError, retry_after_secs};
use crate::services::retry_after_blocks::{Block, Verdict};
use crate::utils::request::{parse_api_key, trusted_client_ip};

/// Refuses every request of a client blocked for retrying before its `Retry-After` with a 429
/// that explains how to get unblocked (see [`crate::services::retry_after_blocks`]).
pub(crate) async fn retry_after_block(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let headers = request.headers();
    let ip = trusted_client_ip(headers).and_then(|ip| ip.parse().ok());
    let Some(block) = state.retry_after_blocks.find(parse_api_key(headers), ip) else {
        return next.run(request).await;
    };
    let verdict = match state.retry_after_blocks.check(&block).await {
        Ok(verdict) => verdict,
        Err(e) => {
            warn!(
                "Failed to check Retry-After block {}, letting the request pass: {e}",
                block.id
            );
            return next.run(request).await;
        }
    };
    metrics::counter!("api_retry_after_block_requests", "outcome" => verdict.outcome.as_str())
        .increment(1);
    if verdict.outcome.passes() {
        return next.run(request).await;
    }
    blocked_response(&block, verdict)
}

fn blocked_response(block: &Block, verdict: Verdict) -> Response {
    let retry_after = retry_after_secs(verdict.retry_after);
    let required = block.required_rounds;
    let message = format!(
        "This client is blocked because it kept sending requests before the Retry-After header \
         allowed. Wait the number of seconds in Retry-After before your next request; a request \
         sent earlier is refused and starts the count over. After {required} requests in a row \
         that waited, the block lifts and requests are answered normally again."
    );
    let body = APIError::StatusMsgJson {
        status: StatusCode::TOO_MANY_REQUESTS,
        message: json!({
            "type": "retry_after_block",
            "message": message,
            "next_request_in": retry_after,
            "requests_waited": verdict.rounds,
            "requests_required": required,
        }),
    };
    ([(RETRY_AFTER, retry_after)], body).into_response()
}
