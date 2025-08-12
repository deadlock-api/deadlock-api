mod demo;
mod events;
mod url;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Live Matches", description = "Live Match related endpoints")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    #[allow(deprecated)]
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(url::url))
        .routes(routes!(demo::demo))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(events::events))
                .layer(CacheControlMiddleware::no_cache()),
        )
}
