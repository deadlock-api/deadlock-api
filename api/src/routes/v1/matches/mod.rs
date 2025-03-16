mod active;
mod ingest_event;
mod ingest_salts;
mod metadata;
mod recently_fetched;
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
        .routes(routes!(ingest_event::ingest_event))
        .routes(routes!(ingest_salts::ingest_salts))
        .routes(routes!(recently_fetched::recently_fetched))
}
