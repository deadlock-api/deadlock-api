mod active;
mod badge_distribution;
mod bulk_metadata;
mod custom;
mod ingest_salts;
mod live_url;
mod metadata;
mod recently_fetched;
mod salts;
mod types;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Matches", description = "
Comprehensive match data endpoints for retrieving detailed information about games.
Provides access to active matches, match metadata, replay salts, and more.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(active::active_matches))
        .routes(routes!(active::active_matches_raw))
        .routes(routes!(ingest_salts::ingest_salts))
        .routes(routes!(recently_fetched::recently_fetched))
        .routes(routes!(bulk_metadata::bulk_metadata))
        .routes(routes!(live_url::url))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(badge_distribution::badge_distribution))
                .layer(
                    CacheControlMiddleware::new(Duration::from_secs(60 * 60))
                        .with_stale_while_revalidate(Duration::from_secs(60 * 60))
                        .with_stale_if_error(Duration::from_secs(60 * 60)),
                ),
        )
        .merge(
            OpenApiRouter::new()
                .routes(routes!(metadata::metadata))
                .routes(routes!(metadata::metadata_raw))
                .routes(routes!(salts::salts))
                .layer(
                    CacheControlMiddleware::new(Duration::from_secs(7 * 24 * 60 * 60))
                        .with_stale_if_error(Duration::from_secs(24 * 60 * 60)),
                ),
        )
        .nest("/custom", custom::router())
}
