//! `/v1/assets/heroes` — rust port of the legacy python `deadlock-assets-api` route.
//!
//! Source files (KV3 + CSS + merged localization JSON) are fetched from R2
//! via [`VersionStore`], parsed, and shaped into the same response the python
//! service serves. Heavy lifting lives in
//! [`crate::services::assets::versions::heroes`].

pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Heroes",
    description = "Hero metadata derived from per-version game data files."
)))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::list_heroes))
        .routes(routes!(route::get_hero_by_name))
        .routes(routes!(route::get_hero))
}
