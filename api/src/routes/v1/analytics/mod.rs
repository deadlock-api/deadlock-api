pub mod hero_comb_stats;
pub mod hero_counters_stats;
pub mod hero_scoreboard;
pub mod hero_stats;
pub mod hero_synergies_stats;
pub mod item_win_loss_stats;
pub mod player_scoreboard;
pub mod scoreboard_types;

use crate::middleware::cache::CacheControlMiddleware;
use crate::state::AppState;
use std::time::Duration;
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
        .routes(routes!(hero_comb_stats::hero_comb_stats))
        .nest(
            "/scoreboards",
            OpenApiRouter::with_openapi(ApiDoc::openapi())
                .routes(routes!(player_scoreboard::player_scoreboard))
                .routes(routes!(hero_scoreboard::hero_scoreboard)),
        )
        .layer(CacheControlMiddleware::new(Duration::from_secs(60 * 60)))
}
