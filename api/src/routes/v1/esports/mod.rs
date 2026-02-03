mod ingest;
mod matches;
mod types;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "E-Sports")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(ingest::ingest_match))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(matches::matches))
                .layer(
                    CacheControlMiddleware::new(Duration::from_mins(10))
                        .with_stale_while_revalidate(Duration::from_hours(1))
                        .with_stale_if_error(Duration::from_hours(1)),
                ),
        )
}
