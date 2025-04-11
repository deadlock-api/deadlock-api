mod active;
mod badge_distribution;
mod bulk_metadata;
mod custom;
mod ingest_event;
mod ingest_salts;
mod live_demo;
mod live_url;
mod metadata;
mod recently_fetched;
mod salts;
mod types;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Matches", description = "Match related endpoints")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(active::active_matches))
        .routes(routes!(active::active_matches_raw))
        .routes(routes!(live_demo::live_demo))
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
