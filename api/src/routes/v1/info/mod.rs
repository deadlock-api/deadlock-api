pub mod health;
pub mod route;

use crate::context::AppState;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Info", description = r"
System status and info endpoints.
Provides health checks for monitoring service availability (Clickhouse, Postgres, Redis) and API statistics including database table sizes, match fetching rates, and missed matches.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(health::health_check))
        .routes(routes!(route::info))
}
