mod route;
mod variables;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Commands",
    description = "Endpoints to resolve commands and variables for the [Deadlock Streamkit](https://streamkit.deadlock-api.com/)."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::command_resolve))
        .routes(routes!(route::variables_resolve))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(route::widget_versions))
                .routes(routes!(route::available_variables))
                .layer(CacheControlMiddleware::new(Duration::from_secs(10 * 60))),
        )
}
