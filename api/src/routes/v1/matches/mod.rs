pub mod active;
pub mod badge_distribution;
pub mod bulk_metadata;
pub mod custom;
pub mod ingest_event;
pub mod ingest_salts;
pub mod live_url;
pub mod metadata;
pub mod recently_fetched;
pub mod salts;
pub mod types;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Matches", description = "Match related endpoints")))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(active::active_matches))
        .routes(routes!(active::active_matches_raw))
        .routes(routes!(ingest_event::ingest_event))
        .routes(routes!(ingest_salts::ingest_salts))
        .routes(routes!(recently_fetched::recently_fetched))
        .routes(routes!(bulk_metadata::bulk_metadata))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(metadata::metadata))
                .routes(routes!(metadata::metadata_raw))
                .routes(routes!(salts::salts))
                .routes(routes!(live_url::live_url))
                .routes(routes!(badge_distribution::badge_distribution))
                .layer(CacheControlMiddleware::new(Duration::from_secs(60 * 60))),
        )
        .nest("/custom", custom::router())
}
