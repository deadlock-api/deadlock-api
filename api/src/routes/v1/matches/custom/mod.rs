mod create;
mod get;
mod ready;
mod utils;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;

#[derive(OpenApi)]
#[openapi(tags((name = "Custom Matches", description = "Custom Match related endpoints")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(ready::ready_up))
        .routes(routes!(ready::unready))
        .routes(routes!(create::create_custom))
        .routes(routes!(get::get_custom))
}
