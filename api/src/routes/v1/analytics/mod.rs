mod hero_counters;
mod hero_synergies;
mod hero_win_loss_stats;
mod item_win_loss_stats;

use crate::state::AppState;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Analytics", description = "Analytics related endpoints")))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(hero_win_loss_stats::hero_win_loss_stats))
        .routes(routes!(item_win_loss_stats::item_win_loss_stats))
        .routes(routes!(hero_counters::hero_counters))
        .routes(routes!(hero_synergies::hero_synergies))
}
