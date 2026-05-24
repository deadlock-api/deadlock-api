use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::assets::common::{AssetsQuery, Language, find_or_404, load_localized};
use crate::services::assets::versions::heroes::{Hero, fetch_heroes};

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct HeroesListQuery {
    /// Language code. Defaults to `english`.
    #[serde(default)]
    #[param(inline)]
    language: Option<Language>,
    /// Client/game version (e.g. `6518`). Defaults to the latest known version.
    #[serde(default)]
    client_version: Option<u32>,
    /// When true, hides heroes that aren't player-selectable or are disabled / in-development.
    #[serde(default)]
    only_active: Option<bool>,
}

#[utoipa::path(
    get,
    path = "/",
    params(HeroesListQuery),
    responses(
        (status = OK, body = [Hero]),
        (status = NOT_FOUND, description = "Requested client_version is not available"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Heroes"],
    summary = "List Heroes",
    description = "Returns the per-hero metadata used by the game client, parsed from the patch's KV3 source files."
)]
pub(super) async fn list_heroes(
    State(state): State<AppState>,
    Query(q): Query<HeroesListQuery>,
) -> APIResult<impl IntoResponse> {
    let heroes = load(&state, q.language, q.client_version).await?;
    // Filter at request time so the underlying cache entry is shared between
    // `only_active=true` and `only_active=false` callers.
    if q.only_active.unwrap_or(false) {
        let filtered: Vec<Hero> = heroes
            .iter()
            .filter(|h| h.player_selectable && !h.disabled && !h.in_development)
            .cloned()
            .collect();
        Ok(Json(filtered).into_response())
    } else {
        Ok(Json(heroes).into_response())
    }
}

#[utoipa::path(
    get,
    path = "/{hero_id}",
    params(
        ("hero_id" = u32, Path, description = "Hero id (`m_HeroID`)"),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = Hero),
        (status = NOT_FOUND, description = "Unknown hero id or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Heroes"],
    summary = "Get Hero",
    description = "Returns a single hero by id."
)]
pub(super) async fn get_hero(
    State(state): State<AppState>,
    Path(hero_id): Path<u32>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let heroes = load(&state, q.language, q.client_version).await?;
    find_or_404(
        &heroes,
        |h| h.id == hero_id,
        format!("Unknown hero id: {hero_id}"),
    )
}

#[utoipa::path(
    get,
    path = "/by-name/{name}",
    params(
        ("name" = String, Path, description = "Hero class name (e.g. `hero_atlas`) or short name (e.g. `atlas`)"),
        AssetsQuery,
    ),
    responses(
        (status = OK, body = Hero),
        (status = NOT_FOUND, description = "Unknown hero name or client_version"),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to load source assets"),
    ),
    tags = ["Heroes"],
    summary = "Get Hero By Name",
    description = "Returns a single hero by `class_name` or display `name`. Matches the bare value as well as the `hero_`-prefixed form."
)]
pub(super) async fn get_hero_by_name(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(q): Query<AssetsQuery>,
) -> APIResult<impl IntoResponse> {
    let heroes = load(&state, q.language, q.client_version).await?;
    let needle = name.to_lowercase();
    let prefixed = format!("hero_{needle}");
    let matches = |s: &str| {
        let s = s.to_lowercase();
        s == needle || s == prefixed
    };
    find_or_404(
        &heroes,
        |h| matches(&h.class_name) || matches(&h.name),
        format!("Unknown hero name: {name}"),
    )
}

/// Returns the cached `Arc<Vec<Hero>>` directly so concurrent requests for
/// the same `(version, language)` share a single underlying allocation.
async fn load(
    state: &AppState,
    language: Option<Language>,
    client_version: Option<u32>,
) -> APIResult<Arc<Vec<Hero>>> {
    load_localized(
        state,
        &AssetsQuery {
            language,
            client_version,
        },
        "heroes",
        fetch_heroes,
    )
    .await
}
