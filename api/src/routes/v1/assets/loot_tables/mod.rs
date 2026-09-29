pub(super) mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((
    name = "Loot Tables",
    description = "Loot table definitions derived from per-version game data files.\n\n\
                   **Deprecated.** The game no longer ships `loot_tables.vdata` from build 6711 on."
)))]
struct ApiDoc;

#[expect(deprecated)]
pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi()).routes(routes!(route::list_loot_tables))
}

#[cfg(test)]
mod tests {
    use utoipa::openapi::Deprecated;

    use super::*;

    /// utoipa takes the deprecation flag from the handler's `#[deprecated]` attribute.
    #[test]
    fn loot_tables_path_is_deprecated() {
        let api = router().get_openapi().clone();
        let op = api
            .paths
            .paths
            .get("/")
            .and_then(|item| item.get.as_ref())
            .expect("missing GET operation");
        assert!(matches!(op.deprecated, Some(Deprecated::True)));
    }
}
