pub mod route;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((name = "SQL", description = "
**Deprecated.** Direct SQL access will be removed. Query the public data lake instead:
https://data.deadlock-api.com (DuckDB / DuckLake) or the MCP server at `/v1/mcp`, see https://deadlock-api.com/data-dumps.
")))]
struct ApiDoc;

#[expect(deprecated)]
pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::sql))
        .routes(routes!(route::list_tables))
        .routes(routes!(route::table_schema))
}
