mod create;
pub mod start;
mod types;

use crate::state::AppState;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Custom Matches [PREVIEW]", description = r#"
Custom Match related endpoints

This is a preview feature and is subject to change.
"#)))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(create::create_custom))
        .routes(routes!(start::start_custom))
}
