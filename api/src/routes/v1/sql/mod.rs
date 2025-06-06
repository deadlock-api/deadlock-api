pub mod route;

use crate::context::AppState;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "SQL", description = "Run SQL queries on the database.")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::sql))
        .routes(routes!(route::list_tables))
        .routes(routes!(route::table_schema))
}
