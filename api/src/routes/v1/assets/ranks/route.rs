use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{StatusCode, header};
use axum::response::IntoResponse;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::assets::common::{AssetsQuery, find_or_404, load_localized};
use crate::services::assets::versions::ranks::{Rank, fetch_ranks};
use crate::services::rank_image::{self, RankImageQuery};

#[utoipa::path(
    get,
    path = "/",
    params(AssetsQuery),
    responses(
        (status = OK, body = [Rank]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Ranks"],
    summary = "List Ranks",
    description = "Returns the 12 player ranks (tier, localized name, badge image URLs, hex color)."
)]
pub(super) async fn list_ranks(
    State(state): State<AppState>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    Ok(Json(load_localized(&state, &q, "ranks", fetch_ranks).await?).into_response())
}

#[utoipa::path(
    get,
    path = "/{tier}",
    params(
        ("tier" = u32, Path, description = "Rank tier (0-11)"),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = Rank),
        (status = NOT_FOUND, description = "Unknown tier or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Ranks"],
    summary = "Get Rank",
    description = "Returns a single rank by tier index."
)]
pub(super) async fn get_rank(
    State(state): State<AppState>,
    Path(tier): Path<u32>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let ranks = load_localized(&state, &q, "ranks", fetch_ranks).await?;
    find_or_404(
        &ranks,
        |r| r.tier == tier,
        format!("Unknown rank tier: {tier}"),
    )
}

#[utoipa::path(
    get,
    path = "/{tier}/{subrank}/image",
    params(
        ("tier" = u32, Path, description = "Rank tier (1-11)"),
        ("subrank" = u32, Path, description = "Division within the tier (1-6)"),
        RankImageQuery,
    ),
    responses(
        (status = OK, description = "Rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = NOT_FOUND, description = "Unknown tier or division"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Ranks"],
    summary = "Rank Subrank Image",
    description = "Returns the tier badge with its I-VI division numeral drawn on it (binary, not a URL). Use `?format=webp` for WebP."
)]
pub(super) async fn subrank_image(
    State(state): State<AppState>,
    Path((tier, subrank)): Path<(u32, u32)>,
    Query(query): Query<RankImageQuery>,
) -> APIResult<impl IntoResponse> {
    if !(1..=11).contains(&tier) || !(1..=6).contains(&subrank) {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            format!("Unknown rank division: {tier}-{subrank}"),
        ));
    }
    let bytes = rank_image::render(&state, tier * 10 + subrank, query.format).await?;
    Ok(([(header::CONTENT_TYPE, query.format.content_type())], bytes))
}
