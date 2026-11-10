pub mod enemy_stats;
pub mod hero_stats;
mod ingest_status;
pub(crate) mod match_history;
pub mod mate_stats;
pub(crate) mod rank;
mod rank_distribution;
mod region;
mod roster_stats;
pub mod steam;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlLayer;

#[derive(OpenApi)]
#[openapi(tags((name = "Players", description = "Player related endpoints")))]
struct ApiDoc;

pub(crate) const CACHE_CONTROL: CacheControlLayer = CacheControlLayer::new(Duration::from_mins(5))
    .with_stale_while_revalidate(Duration::from_mins(1));

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(match_history::match_history))
        .routes(routes!(mate_stats::mate_stats))
        .routes(routes!(enemy_stats::enemy_stats))
        .routes(routes!(hero_stats::player_hero_stats))
        .routes(routes!(ingest_status::ingest_status))
        .routes(routes!(rank::rank))
        .routes(routes!(rank::rank_batch))
        .routes(routes!(rank::rank_image))
        .routes(routes!(rank::rank_avg_image))
        .routes(routes!(rank_distribution::rank_distribution))
        .routes(routes!(region::region))
        .merge(steam::router())
        .layer(CACHE_CONTROL)
}
