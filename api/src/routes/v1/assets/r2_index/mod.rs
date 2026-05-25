//! `/v1/assets/{images,icons,sounds,fonts}` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Assets",
    description = "File-tree indexes of static assets (images, icons, sounds, fonts) hosted on \
                   the CDN, mapping each asset's name to its public URL."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::images))
        .routes(routes!(route::icons))
        .routes(routes!(route::sounds))
        .routes(routes!(route::fonts))
}
