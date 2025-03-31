mod hero_comb_win_loss_stats;
mod hero_counters_stats;
pub mod hero_stats;
mod hero_synergies_stats;
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
        .routes(routes!(hero_stats::hero_stats))
        .routes(routes!(item_win_loss_stats::item_win_loss_stats))
        .routes(routes!(hero_counters_stats::hero_counters_stats))
        .routes(routes!(hero_synergies_stats::hero_synergies_stats))
        .routes(routes!(hero_comb_win_loss_stats::hero_comb_win_loss_stats))
}
