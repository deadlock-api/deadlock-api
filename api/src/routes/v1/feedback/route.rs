use core::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use tracing::error;
use uuid::Uuid;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::feedback::structs::{FeedbackSubmission, truncate_user_agent};
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[utoipa::path(
    post,
    path = "/",
    request_body = FeedbackSubmission,
    responses(
        (status = CREATED, description = "Feedback stored."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Internal server error")
    ),
    tags = ["Internal"],
    summary = "Submit Website Feedback",
    description = "
Stores a component annotation or general feedback submitted from deadlock-api.com.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/min, 100req/h |
| Key | - |
| Global | 2000req/h |
    "
)]
pub(super) async fn submit_feedback(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut submission): Json<FeedbackSubmission>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "feedback",
            &[
                Quota::ip_limit(10, Duration::from_mins(1)),
                Quota::ip_limit(100, Duration::from_hours(1)),
                Quota::global_limit(2000, Duration::from_hours(1)),
            ],
        )
        .await?;

    let page_path = submission.validate()?;
    let source = submission.source.as_ref();
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(truncate_user_agent);

    sqlx::query(
        "
        INSERT INTO website_feedback (id, kind, comment, nickname, page_path, page_url, build_id,
                                      source_file, source_line, source_column, component, component_chain,
                                      selector, element_text, viewport_width, viewport_height,
                                      device_pixel_ratio, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ",
    )
    .bind(Uuid::new_v4())
    .bind(<&'static str>::from(submission.kind))
    .bind(&submission.comment)
    .bind(&submission.nickname)
    .bind(&page_path)
    .bind(&submission.page_url)
    .bind(&submission.build_id)
    .bind(source.map(|s| s.file.as_str()))
    .bind(source.map(|s| s.line))
    .bind(source.map(|s| s.column))
    .bind(source.and_then(|s| s.component.as_deref()))
    .bind(source.map(|s| s.chain.as_slice()))
    .bind(&submission.selector)
    .bind(&submission.element_text)
    .bind(submission.viewport.map(|v| v.width))
    .bind(submission.viewport.map(|v| v.height))
    .bind(submission.viewport.map(|v| v.device_pixel_ratio))
    .bind(user_agent)
    .execute(&state.pg_client)
    .await
    .map_err(|e| {
        error!("Failed to store website feedback: {e}");
        APIError::internal("Failed to store feedback")
    })?;

    Ok(StatusCode::CREATED)
}
