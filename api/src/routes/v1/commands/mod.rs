mod route;
mod variables;

use crate::state::AppState;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Commands", description = "Command related endpoints")))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(route::available_variables))
        .routes(routes!(route::widget_versions))
        .routes(routes!(route::command_resolve))
        .routes(routes!(route::variables_resolve))
}
