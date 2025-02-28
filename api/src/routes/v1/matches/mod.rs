mod active;
mod ingest;
mod metadata;
mod salts;
mod types;

use crate::state::AppState;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(OpenApi)]
#[openapi(tags((name = "Matches", description = "Match related endpoints")))]
pub struct ApiDoc;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(active::active_matches))
        .routes(routes!(active::active_matches_raw))
        .routes(routes!(metadata::metadata))
        .routes(routes!(metadata::metadata_raw))
        .routes(routes!(salts::salts))
        .routes(routes!(ingest::ingest))
}
