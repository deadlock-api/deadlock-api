mod batch;
pub mod mmr_history;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((name = "MMR", description = "
# STOP! READ THIS FIRST!

Please be very careful when using this endpoint and make yourself familiar with the way we calculate the MMR.

This is how we calculate a player MMR.

1. We take the average badge of the team the player was on in a match.
2. We convert the badge to a MMR score using the formula: `(intDiv(badge, 10) - 1) * 6 + (badge % 10)`
3. We calculate a weight for the match using the formula: `if(party = 0, 4.0, 1.0) / pow(row_number() OVER (ORDER BY match_id DESC), 0.4)`
4. We calculate a weighted average of the last 20 matches using the formula: `sum(mmr_score * weight) / sum(weight)`
5. We convert the MMR score back to a badge using the formula: `10 * intDiv(mmr_score, 6) + 11 + modulo(mmr_score, 6)`

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(batch::mmr))
        .routes(routes!(batch::hero_mmr))
        .routes(routes!(mmr_history::mmr_history))
        .routes(routes!(mmr_history::hero_mmr_history))
}
