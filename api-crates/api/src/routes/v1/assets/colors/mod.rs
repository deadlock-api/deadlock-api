//! `/v1/assets/colors` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Colors",
    description = "Panorama color palette from per-version `citadel_base_styles.css`."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi()).routes(routes!(route::list_colors))
}
