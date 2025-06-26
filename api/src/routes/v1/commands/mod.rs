mod route;
mod variables;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use std::time::Duration;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Commands", description = r"
Integration endpoints for the [Deadlock Streamkit](https://streamkit.deadlock-api.com/).
Provides functionality to resolve dynamic command templates and variables for streaming overlays and chat commands.
Includes endpoints to retrieve available variables, resolve specific variables or command templates, and get widget version information.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::command_resolve))
        .routes(routes!(route::variables_resolve))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(route::widget_versions))
                .routes(routes!(route::available_variables))
                .layer(
                    CacheControlMiddleware::new(Duration::from_secs(60 * 60))
                        .with_stale_while_revalidate(Duration::from_secs(60 * 60))
                        .with_stale_if_error(Duration::from_secs(60 * 60)),
                ),
        )
}
