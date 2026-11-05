//! `/v1/assets/ranked-seasons` route layer.

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Ranked Seasons",
    description = "Ranked season definitions derived from per-version game data files."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    // Inherits the assets router's 1 h edge cache: a game update can move an interval boundary on short notice (build
    // 6851 moved interval 2's start by 4 h on its go-live day), and the unversioned URL must pick that up quickly.
    OpenApiRouter::with_openapi(ApiDoc::openapi()).routes(routes!(route::list_ranked_seasons))
}
