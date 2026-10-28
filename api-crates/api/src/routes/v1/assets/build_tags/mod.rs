//! `/v1/assets/build-tags` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Build Tags",
    description = "Build tag definitions derived from per-version localization keys."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::list_build_tags))
        .routes(routes!(route::get_build_tag_by_name))
        .routes(routes!(route::get_build_tag))
}
