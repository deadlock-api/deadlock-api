pub mod card;
pub mod enemy_stats;
pub mod hero_stats;
pub(crate) mod match_history;
pub mod mate_stats;
pub mod mmr;
pub mod party_stats;
pub mod steam;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Players", description = "Player related endpoints")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(match_history::match_history))
        .routes(routes!(card::card))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(mate_stats::mate_stats))
                .routes(routes!(enemy_stats::enemy_stats))
                .routes(routes!(party_stats::party_stats))
                .routes(routes!(hero_stats::hero_stats))
                .layer(
                    CacheControlMiddleware::new(Duration::from_secs(60 * 60))
                        .with_stale_while_revalidate(Duration::from_secs(60 * 60))
                        .with_stale_if_error(Duration::from_secs(60 * 60)),
                ),
        )
        .merge(mmr::router())
        .merge(steam::router())
}
