mod active;
mod badge_distribution;
mod bulk_metadata;
mod ingest_event;
mod ingest_salts;
mod metadata;
mod recently_fetched;
mod salts;
mod types;

use crate::middleware::cache::CacheControlMiddleware;
use crate::state::AppState;
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
        .merge(
            OpenApiRouter::new()
                .routes(routes!(metadata::metadata))
                .routes(routes!(metadata::metadata_raw))
                .routes(routes!(bulk_metadata::bulk_metadata))
                .routes(routes!(salts::salts))
                .routes(routes!(badge_distribution::badge_distribution))
                .layer(CacheControlMiddleware::new(Duration::from_secs(
                    24 * 60 * 60,
                ))),
        )
}
