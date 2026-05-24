pub(crate) mod batch;
mod distribution;
pub mod mmr_history;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(OpenApi)]
#[openapi(tags((name = "MMR", description = "
# STOP! READ THIS FIRST!

Please be very careful when using this endpoint and make yourself familiar with the way we calculate the MMR.

This is how we calculate a player MMR.

1. We take the average badge of the team the player was on in a match.
2. We convert the badge to a MMR score using the formula: `(intDiv(badge, 10) - 1) * 6 + (badge % 10)`
3. We do a exponential moving average (EMA) of the last 50 matches to get the player's MMR score.
4. We convert the MMR score back to a badge using the formula: `10 * intDiv(mmr_score, 6) + 1 + mmr_score % 6`

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 5req/min |
| Key | 25req/min |
| Global | 50req/min |

Rate limits are shared across all MMR endpoints (single bucket).
    "
)))]
struct ApiDoc;

pub(super) async fn apply_mmr_rate_limits(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
) -> APIResult<()> {
    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            "mmr",
            &[
                Quota::ip_limit(5, Duration::from_mins(1)),
                Quota::key_limit(25, Duration::from_mins(1)),
                Quota::global_limit(50, Duration::from_mins(1)),
            ],
        )
        .await?;
    Ok(())
}

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(distribution::mmr_distribution))
        .routes(routes!(distribution::hero_mmr_distribution))
        .routes(routes!(batch::mmr))
        .routes(routes!(batch::hero_mmr))
        .routes(routes!(mmr_history::mmr_history))
        .routes(routes!(mmr_history::hero_mmr_history))
}
