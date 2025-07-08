pub mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((name = "SQL", description = "
Database exploration endpoints for direct SQL access.
Provides functionality to execute custom SQL queries with rate limiting protection, list available tables, and inspect table schemas.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::sql))
        .routes(routes!(route::list_tables))
        .routes(routes!(route::table_schema))
}
