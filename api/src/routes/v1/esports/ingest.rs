use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::esports::types::ESportsMatch;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use core::time::Duration;
use serde_json::json;
use tracing::warn;
use uuid::Uuid;

#[utoipa::path(
    post,
    path = "/ingest/match",
    request_body = ESportsMatch,
    responses(
        (status = OK),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Ingest failed")
    ),
    tags = ["E-Sports"],
    summary = "Ingest",
    description = r"
To use this Endpoint you need to have special permissions.
Please contact us if you organize E-Sports Matches and want to ingest them to us.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 1000req/h |
| Key | - |
| Global | 10000req/h |
    "
)]
pub(super) async fn ingest_match(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    Json(match_data): Json<ESportsMatch>,
) -> APIResult<impl IntoResponse> {
    match utils::checks::check_api_key_is_esports_ingest_key(&state.pg_client, rate_limit_key).await
    {
        Ok(true) => Ok(()),
        Ok(false) => Err(APIError::status_msg(
            StatusCode::FORBIDDEN,
            "Your API-Key has not the necessary permissions to perform this action!",
        )),
        Err(e) => {
            warn!("Failed to validate API-Key: {e}");
            Err(APIError::internal("Failed to validate API-Key!"))
        }
    }?;

    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "esports_match_ingest",
            &[
                Quota::key_limit(1000, Duration::from_secs(60 * 60)),
                Quota::global_limit(10000, Duration::from_secs(60 * 60)),
            ],
        )
        .await?;

    sqlx::query!(
        r#"
    INSERT INTO esports_matches (
        update_id,
        provider,
        match_id,
        team0_name,
        team1_name,
        tournament_name,
        tournament_stage,
        scheduled_date,
        status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (update_id) DO UPDATE SET
        match_id = EXCLUDED.match_id,
        team0_name = EXCLUDED.team0_name,
        team1_name = EXCLUDED.team1_name,
        tournament_name = EXCLUDED.tournament_name,
        tournament_stage = EXCLUDED.tournament_stage,
        scheduled_date = EXCLUDED.scheduled_date,
        status = EXCLUDED.status,
        updated_at = now()
            "#,
        match_data.update_id.unwrap_or(Uuid::new_v4()),
        match_data.provider,
        match_data.match_id,
        match_data.team0_name,
        match_data.team1_name,
        match_data.tournament_name,
        match_data.tournament_stage,
        match_data.scheduled_date,
        match_data.status as _,
    )
    .execute(&state.pg_client)
    .await?;

    Ok(Json(json! ({
        "status": 200,
        "message": "Match successfully ingested"
    })))
}
