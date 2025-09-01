pub(crate) mod route;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Steam", description = "Steam related endpoints")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::steam_search))
        .routes(routes!(route::steam))
        .layer(
            CacheControlMiddleware::new(Duration::from_secs(60 * 60))
                .with_stale_while_revalidate(Duration::from_secs(60 * 60))
                .with_stale_if_error(Duration::from_secs(60 * 60)),
        )
}
