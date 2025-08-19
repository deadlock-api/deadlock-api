pub mod health;
pub mod rank_data;
pub mod route;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Info", description = "
System status and info endpoints.
Provides health checks for monitoring service availability (Clickhouse, Postgres, Redis) and API statistics including database table sizes, match fetching rates, and missed matches.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(health::health_check))
        .routes(routes!(route::info))
        .merge(
            OpenApiRouter::new()
                .routes(routes!(rank_data::rank_data))
                .layer(
                    CacheControlMiddleware::new(Duration::from_secs(60 * 60))
                        .with_stale_while_revalidate(Duration::from_secs(60 * 60))
                        .with_stale_if_error(Duration::from_secs(60 * 60)),
                ),
        )
}
