pub mod card;
pub mod hero_stats;
pub mod item_stats;
pub mod match_history;
pub mod mate_stats;
pub mod party_stats;
pub mod scoreboard;
pub mod types;

use crate::middleware::cache::CacheControlMiddleware;
use crate::state::AppState;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Players", description = "Player related endpoints")))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(match_history::match_history))
        .routes(routes!(card::card_raw))
        .routes(routes!(card::card))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(mate_stats::mate_stats))
                .routes(routes!(party_stats::party_stats))
                .routes(routes!(item_stats::item_stats))
                .routes(routes!(hero_stats::hero_stats))
                .routes(routes!(scoreboard::scoreboard))
                .layer(CacheControlMiddleware::new(Duration::from_secs(60 * 60))),
        )
}
