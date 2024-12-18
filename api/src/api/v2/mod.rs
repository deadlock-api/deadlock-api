use crate::state::AppState;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;

#[derive(OpenApi)]
#[openapi(tags((name = "V2")))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
}
