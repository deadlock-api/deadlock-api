use axum::Json;
use axum::extract::{Query, State};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{AssetsQuery, load_localized};
use crate::services::assets::versions::ranked_seasons::{RankedSeason, fetch_ranked_seasons};

#[utoipa::path(
    get,
    path = "/",
    params(AssetsQuery),
    responses(
        (status = OK, body = [RankedSeason]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Ranked Seasons"],
    summary = "List Ranked Seasons",
    description = "Returns the ranked season definitions used by the game client, parsed from the patch's KV3 source files. Each season carries its eligibility requirements and the intervals it runs for, as unix timestamps in seconds."
)]
pub(super) async fn list_ranked_seasons(
    State(state): State<AppState>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(
        Json(load_localized(&state, &q, "ranked seasons", fetch_ranked_seasons).await?)
            .into_response(),
    )
}
