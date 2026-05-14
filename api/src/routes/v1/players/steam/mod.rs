pub(crate) mod route;
mod update;

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
    let read_routes = OpenApiRouter::new()
        .routes(routes!(route::steam_search))
        .routes(routes!(route::steam))
        .layer(
            CacheControlMiddleware::new(Duration::from_hours(1))
                .with_stale_while_revalidate(Duration::from_hours(1)),
        );

    let write_routes = OpenApiRouter::new()
        .routes(routes!(update::steam_update))
        .layer(CacheControlMiddleware::new(Duration::from_secs(0)).private());

    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(read_routes)
        .merge(write_routes)
}
