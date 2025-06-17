pub mod build_item_stats;
pub mod hero_comb_stats;
pub mod hero_counters_stats;
pub mod hero_scoreboard;
pub mod hero_stats;
pub mod hero_synergies_stats;
mod item_permutation_stats;
pub mod item_stats;
pub mod player_scoreboard;
pub mod scoreboard_types;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Analytics", description = r#"
Comprehensive game statistics and analysis endpoints.
Provides detailed performance metrics for heroes, items, and players, including hero synergies, counters, and combinations.
Features scoreboards for both heroes and players.
"#)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi()).merge(
        OpenApiRouter::new()
            .routes(routes!(hero_stats::hero_stats))
            .routes(routes!(item_stats::item_stats))
            .routes(routes!(item_permutation_stats::item_permutation_stats))
            .routes(routes!(hero_counters_stats::hero_counters_stats))
            .routes(routes!(hero_synergies_stats::hero_synergies_stats))
            .routes(routes!(hero_comb_stats::hero_comb_stats))
            .routes(routes!(build_item_stats::build_item_stats))
            .nest(
                "/scoreboards",
                OpenApiRouter::with_openapi(ApiDoc::openapi())
                    .routes(routes!(player_scoreboard::player_scoreboard))
                    .routes(routes!(hero_scoreboard::hero_scoreboard)),
            )
            .layer(
                CacheControlMiddleware::new(Duration::from_secs(60 * 60))
                    .with_stale_while_revalidate(Duration::from_secs(4 * 60 * 60))
                    .with_stale_if_error(Duration::from_secs(4 * 60 * 60)),
            ),
    )
}
