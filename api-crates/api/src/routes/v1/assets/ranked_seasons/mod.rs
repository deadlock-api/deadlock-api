//! `/v1/assets/ranked-seasons` route layer.

pub(super) mod route;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Ranked Seasons",
    description = "Ranked season definitions derived from per-version game data files."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    // Seasons only change with a game update, and the website blocks every analytics page on this list: keep it at the
    // edge for a day and serve it stale for a week while it revalidates.
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::list_ranked_seasons))
        .layer(
            CacheControlMiddleware::new(Duration::from_hours(24))
                .with_stale_while_revalidate(Duration::from_hours(24 * 7))
                .with_stale_if_error(Duration::from_hours(24 * 30)),
        )
}
